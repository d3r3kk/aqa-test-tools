const DataManager = require('./DataManager');
const { TestResultsDB, AuditLogsDB } = require('./Database');
const { logger } = require('./Utils');
const { getCIProviderName, getCIProviderObj } = require(`./ciServers`);
const Azure = require(`./ciServers/Azure`);

class AzureBuildMonitor {
    async execute(task, historyNum = 5) {
        let { buildUrl, type, streaming } = task;
        buildUrl = "https://dev.azure.com/ms-juniper/Juniper/_build?definitionId=425"
        streaming = "Yes"
        type = "Test"
        const server = getCIProviderName(buildUrl);
        const ciServer = getCIProviderObj(server);
        const { buildName, url } = ciServer.getBuildInfoByUrl(buildUrl);

        if (!buildName) {
            logger.error("AzureBuildMonitor: Cannot parse buildUrl ", buildUrl);
            return;
        }
        logger.debug("AzureBuildMonitor: url", url, "buildName", buildName);

        const allBuilds = await ciServer.getAllBuilds(url, buildName);
        console.log("allBuilds********", allBuilds)

        if (!Array.isArray(allBuilds)) {
            logger.error("allBuilds:", allBuilds);
            logger.error("AzureBuildMonitor: Cannot find the build ", buildUrl);
            return;
        }
        // sort the allBuilds to make sure build number is in
        // descending order
        allBuilds.sort((a, b) => parseInt(b.buildNum) - parseInt(a.buildNum));
        /*
         * Loop through allBuilds or past 5 builds (whichever is
         * less) to avoid OOM error. If there is not a match in db,
         * create the new build. Otherwise, break. Since allBuilds
         * are in descending order, we assume if we find a match,
         * all remaining builds that has a lower build number is in
         * db.
         */
        const limit = Math.min(historyNum, allBuilds.length);
        const testResults = new TestResultsDB();
        for (let i = 1; i < limit; i++) {
            delete allBuilds[i].azure.triggerInfo;
           
            const buildNum = parseInt(allBuilds[i].buildNum, 10);
            
            // // Get the triggered build from a build pipelines by parsing the log
            

            await this.getBaseInfoFromBuildIds(allBuilds[i], buildNum, ciServer, url, testResults, buildName)
        }
    }


    async getBaseInfoFromBuildIds(singleBuild, buildNum, ciServer, url, testResults, buildName){
        // Get all the test runs from a build 
        const testRuns = await ciServer.query_test_runs(url, buildNum, singleBuild.azure.startTime, singleBuild.azure.finishTime);

        const triggeredBuildIds = await ciServer.getTriggeredBuildIds(url, buildNum);
        //console.log(triggeredBuildIds)

        for(let tId of triggeredBuildIds){
            const triggerItem = await ciServer.getSpecificBuild(url, tId);
            await this.getBaseInfoFromBuildIds(triggerItem[0], tId, ciServer, url, testResults, triggerItem[0].azure.definition.id);
        }

        // const trigger0 = await ciServer.getSpecificBuild(url, triggeredBuildIds[0].definition.id);
        // console.log(trigger0)

        //Store the runIds info into database
        for (let testRun of testRuns)
        {
            await testResults.populateDB(testRun);
        }


        const buildsInDB = await testResults.getData({ url, buildName, buildNum }).toArray();
        if (!buildsInDB || buildsInDB.length === 0) {
            let status = "NotDone";
            //let status = "Done";
            // if (streaming === "Yes" && singleBuild.result === null) {
            //     status = "Streaming";
            //     logger.info(`Set build ${url} ${buildName} ${buildNum} status to Streaming `);
            // }

            //const buildType = type === "FVT" ? "Test" : type;

            const parentId = await this.insertData({
                url,
                ...singleBuild,
                //type: buildType,
                status,
                triggeredBuildIds,
            });
            // insert all records in Azure timeline
            //(39605, https:../Juniper)
            const timelineRecs = await ciServer.getTimelineRecords(url, buildNum);

            //const extraData = {status, url, buildName, buildNum, type: buildType};
            const extraData = {status, url, buildName, buildNum};
            
            await this.insertBuilds(timelineRecs, null, parentId, extraData);
            //await this.insertBuilds(timelineRecs, subId, parentId, extraData);
        } else {
            return;
        }

    }

    getChildrenByParentId(recArray, id) {
        return recArray.filter(rec => rec.azure.parentId === id );
    }

    // return the children task from parents recursively from top to bottom
    async insertBuilds(recArray, azureParentId, trssParentId, extraData) {
        console.log("insertBuilds recArray", recArray.length, azureParentId);
        if (!recArray || recArray.length === 0) return;
        const children = this.getChildrenByParentId(recArray, azureParentId);
        for (let child of children) {
            // if((child.azure && child.azure.type == 'Stage' && child.buildName.includes("test dev"))
            //  || (child.azure && child.azure.type == 'Phase')
            //  || (child.azure && child.azure.type == 'Job' && child.buildNameStr != 'Finalize build')){
                const newTrssParentId = await this.insertData({
                    parentId : trssParentId,
                    ...child,
                    ...extraData,
                });

                await this.insertBuilds(recArray, child.subId, newTrssParentId, extraData);
            //}
            //await this.insertBuilds(recArray, child.id, newTrssParentId, extraData);
        }
    }

    //create build in test result and insert data into audit logs and 
    async insertData(data) {
        const _id = await new DataManager().createBuild(data);
        const { url, buildName, buildNum, status, buildNameStr, subId } = data;
        await new AuditLogsDB().insertAuditLogs({
            action: "[createBuild]",
            _id,
            url,
            buildName,
            buildNum,
            buildNameStr,
            subId,
            status,
        });
        return _id;
    }
}
module.exports = AzureBuildMonitor;