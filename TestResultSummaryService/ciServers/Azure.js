const Promise = require('bluebird');
const azdev = require("azure-devops-node-api");
// import * as ba from "azure-devops-node-api/BuildApi";
//import * as bi from "azure-devops-node-api/interfaces/BuildInterfaces";
const { logger, getParams } = require('../Utils');
const ArgParser = require("../ArgParser");
const CIServer = require('./CIServer');

const fs = require('fs');
const { url } = require('inspector');
const e = require('express');
const { Z_BUF_ERROR } = require('zlib');
const { TestApi } = require('azure-devops-node-api/TestApi');

const options = { request: { timeout: 2000 } };

// Server connection may drop. If timeout, retry.
const retry = fn => {
    const promise = Promise.promisify(fn);
    return async function () {
        for (let i = 0; i < 5; i++) {
            try {
                return await promise.apply(null, arguments);
            } catch (e) {
                logger.warn(`Try #${i + 1}: connection issue`, arguments);
                logger.warn(e);
                if (e.toString().includes("unexpected status code: 404")) {
                    return { code: 404 };
                }
            }
        }
    }
}


// match Azure BuildResult to TRSS build result
// For Azure code, please check azure-devops-node-api/interfaces/BuildInterfaces.d.ts
const buildResult = {
    //0: null,  // None
    0: "SUCCESS",
    2: "FAILURE",
    //4: "FAILURE",  // PartiallySucceeded
    4: "SKIPPED",  // PartiallySucceeded
    8: "FAILURE",
    32: "ABORT"  // Canceled
};

// match Azure BuildResult to TRSS build result
const state = {
    0: "Pending",
    1: "InProgress",
    2: "Completed"
};


/**
 * definition === build name
 * 

 */
class Azure extends CIServer {

    constructor(options) {
        super(options);
        this.credentails = ArgParser.getConfig();
    }

    // Assumming if it is not azure, it is Jenkins
    static matchServer(buildUrl) {
        return buildUrl.match(/dev.azure.com/) || buildUrl.match(/visualstudio.com/);
    }



    /**
     * 
     * @param {*} url 
     * @param {*} definitionId is the term in Adzure. In TRSS, it is the same as buildName in Jenkins
     * In Azure, buildNumber is a string. (i.e., OpenJDK8U-jdk_x64_mac_hotspot_2020-04-01-18-33)
     * @return [] [{duration, id, result, timestamp}, ...]
     * duration = finishTime - startTime
     * result: SUCCESS === 2
     * timestamp = startTime
     * N
id: "1869",
result: "SUCCESS",
timestamp: 1584734443756
     */
    async getAllBuilds(url, definition) {
        const { projectName, orgUrl } = this.getProjectInfo(url);
        const token = this.getToken(url);
        const authHandler = azdev.getPersonalAccessTokenHandler(token);
        const connection = new azdev.WebApi(orgUrl, authHandler);

        const buildApi = await connection.getBuildApi();
        //definition: 449
        //projectName: juniper
        const builds = await buildApi.getBuilds(projectName, [definition]);
        // console.log("getAllBuilds builds", builds)
        return this.formatData(builds, true, url);
    }

    // async getTestsFromRunIds(){
    //     // Get the build API of AzDo Rest API
    //     const { orgUrl, projectName } = this.getProjectInfo(url);
    //     const testApi = await this.getTestApi(orgUrl, projectName);



    // }


    async getSpecificBuild(url, buildId)
    {
        // Get the build API of AzDo Rest API
        const { orgUrl, projectName } = this.getProjectInfo(url);
        const buildApi = await this.getBuildApi(orgUrl, projectName);

        const specificBuild = await buildApi.getBuild(projectName, buildId)
        return this.formatData([specificBuild], true, url);
    }

    async extractTriggeredBuildIds(output) {
        let m;
        let tIds = [];
        //const tIdRegex = /Following Builds will be awaited:([\s\S]+)([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})/;
        const tIdRegex = /buildId=([0-9]{5})/
        if ((m = tIdRegex.exec(output)) !== null) {
            //console.log(m[1])
            tIds.push(m[1].trim());
        }
        return tIds;
    }

    async getTriggeredBuildIds(url, buildNum){
        // Get the build API of AzDo Rest API
        const { orgUrl, projectName } = this.getProjectInfo(url);
        const buildApi = await this.getBuildApi(orgUrl, projectName);

        // Get all logs in a build with the name TriggerBuild
        const logs = await buildApi.getBuildTimeline(projectName, buildNum);
        
        var results = [];

        if(logs.records){
            for (let azure of logs.records)
            {
                //console.log(azure.result);
                if ((azure.type && azure.type == "Task") && 
                (azure.result !== null && azure.result !== 4) && 
                (azure.name && azure.name == "TriggerBuild" || 
                azure.name && azure.name.includes("trigger"))) {
                    let output = await this.getBuildOutput({url, buildNum, azure});
                    if(output){
                        //const res = azure.result;
                        let tid_items = await this.extractTriggeredBuildIds(output)
                        results.push(...tid_items)
                    }
                }
            }
        }
        return results
    }

    async query_test_runs(url, buildNum, startTime, finishTime){
        // Get the build API of AzDo Rest API
        const { orgUrl, projectName } = this.getProjectInfo(url);
        const buildApi = await this.getBuildApi(orgUrl, projectName);
        const testApi = await this.getTestApi(orgUrl, projectName);

        // Get all runIds 
        const runIds = await testApi.queryTestRuns(projectName, startTime, finishTime, null, null, null, null, [buildNum]);
        //console.log(runIds)

        return runIds


    }

    


    streamToString(stream) {
        const chunks = []
        return new Promise((resolve, reject) => {
            stream.on('data', chunk => chunks.push(chunk))
            stream.on('error', reject)
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        })
    }

    async getBuildOutput(task) {
        const { url, buildNum, azure } = task;
        
        if (!azure) console.log("getBuildOutput there is no azure", task);
        if (azure && azure.log && azure.log.id) {
            const { orgUrl, projectName } = this.getProjectInfo(url);
            const buildApi = await this.getBuildApi(orgUrl, projectName);
            //console.log("getBuildOutput ", projectName, buildNum, azure);
            const output = await buildApi.getBuildLog(projectName, buildNum, azure.log.id);
            return await this.streamToString(output);
        }
        return null;
    }

    async getBuildInfo(task) {
        let [url, buildName, buildNum, subId] = task
        // let url = task.url;
        // let buildName = task.buildName;
        // let buildNum = task.buildNum;
        // let subId = task.subId;

        //url: https::juniper buildName: 37852
        const records = await this.getTimelineRecords(url, buildNum);
        //return records
        if(subId){
            for(let rec of records){
                if(rec.subId === subId){
                    return [rec];
                }
            }
        }
        else{
            return records
        }
        // for (let rec of records) {
        //     return ([rec])
        // };
        return null;
    }

    formatData(data, setBuildNum = false, url) {

        return data.map(d => {
            let buildUrl = url;
            if (d._links) {
                buildUrl = d._links.web.href;
            } else if (d.url) {
                buildUrl = d.url;
            } else if (d.log) {
                buildUrl = d.log.url;
            } else if (d.buildUrl){
                buildUrl =d.buildUrl
            }
            else{
                buildUrl = null;
            }

            let buildName = null;
            if(d.definition){
                buildName = d.definition.name
            }
            else if(d.name){
                buildName = d.name
            }
            let subId = null;
            if(d.project){
                subId = d.project.id
            }
            else if(d.id){
                subId = d.id
            }
            let buildNameStr = null;
            if(d.buildNumber){
                buildNameStr = d.buildNumber
            }
            else if(d.name){
                buildNameStr = d.name
            }

            let type = "Test"
            let hasChildren = false
            if(d.type){
                if(d.type == "Stage" || d.type == "Phase") {
                    type = 'Build';
                    hasChildren = true
                }
            }

            let result = null
            //console.log(d.result)
            if(d.result != null)
            {
                result = buildResult[d.result]
            }
            return {
                buildUrl: buildUrl,
                buildNum: setBuildNum && d.id ? d.id : null,
                duration: (d.startTime && d.finishTime) ? d.finishTime.getTime() - d.startTime.getTime() : null,
                //result: d.result ? buildResult[d.result] : null,
                //buildResult: d.result ? buildResult[d.result] : null,
                buildResult: result,
                buildNameStr: buildNameStr,
                
                timestamp: d.startTime ? d.startTime.getTime() : null,
                //building: d.status && d.status !== 2 || d.state && d.state !== 2 ? true : null,
                building: d.status && d.status !== 2 || d.state && d.state !== 2 ? true : false,
                buildName: buildName,
                subId: subId,
                type: type,
                hasChildren: hasChildren,
                azure: d,
            };
        });
    }


    async getTimelineRecords(url, buildNum) {
        const { orgUrl, projectName } = this.getProjectInfo(url);
        const buildApi = await this.getBuildApi(orgUrl, projectName);
        //(Juniper, 39605)
        const timeline = await buildApi.getBuildTimeline(projectName, buildNum);
        if (timeline) {
            return this.formatData(timeline.records);
        }
        return null;
    }


    // async getLastBuildInfo(url, buildName) {
    //     const newUrl = this.addCredential(url);
    //     const jenkins = jenkinsapi.init(newUrl, options);
    //     const last_build_info = retry(jenkins.last_build_info);
    //     const body = await last_build_info(buildName);
    //     return body;
    // }

    getBuildParams(buildInfo) {
        return null;
    }


    // set definitionId as buildName
    // https://dev.azure.com/adoptopenjdk/AdoptOpenJDK/_build?definitionId=3&_a=summary

    // https://dev.azure.com/ms-juniper/Juniper/_build?definitionId=425
    getBuildInfoByUrl(buildUrl) {
        let tokens = buildUrl.split("?");
        let buildName = null;
        let url = null;
        if (tokens && tokens.length === 2) {
            url = tokens[0].replace(/\/_build/, "");
            const paramsStr = tokens[1];
            const paramsObj = getParams(paramsStr);
            if (paramsObj && paramsObj.definitionId) {
                buildName = paramsObj.definitionId;
            }
        }
        return { buildName, url };
    }

    getToken(url) {
        let token = null;
        // if (this.credentails && this.credentails.hasOwnProperty(url)) {
        //     token = encodeURIComponent(this.credentails[url].password);
        // }
        token = 'sz7jxhbi3wcdewhdrwpj2lw6nd5lnxoqvx3rpu23nntopzuxnrva';

        return token;
    }

    getProjectInfo(url) {
        //split based on / and project name should be the last element
        let projectName = null;
        let orgUrl = null;
        let tokens = url.split("/");
        if (tokens && tokens.length > 1) {
            projectName = tokens.pop();
            orgUrl = url.replace(`/${projectName}`, "");
        }
        return { projectName, orgUrl };
    }

    async getBuildApi(url) {
        const token = this.getToken(url);
        const authHandler = azdev.getPersonalAccessTokenHandler(token);
        const connection = new azdev.WebApi(url, authHandler);

        return await connection.getBuildApi();
    }

    async getTestApi(url)
    {
        const token = this.getToken(url);
        const authHandler = azdev.getPersonalAccessTokenHandler(token);
        const connection = new azdev.WebApi(url, authHandler);

        return await connection.getTestApi();
    }
    

}

module.exports = Azure;



//in getBuildInfo
// const token = this.getToken(url);
        // const { projectName, orgUrl } = this.getProjectInfo(url);
        // const authHandler = azdev.getPersonalAccessTokenHandler(token);
        // const connection = new azdev.WebApi(orgUrl, authHandler);

        // const buildApi = await connection.getBuildApi();
        // const timeline = await buildApi.getBuildTimeline(projectName, buildNum);