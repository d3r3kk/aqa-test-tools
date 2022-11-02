const Promise = require('bluebird');
const azdev = require( "azure-devops-node-api");
// import * as ba from "azure-devops-node-api/BuildApi";
// import * as bi from "azure-devops-node-api/interfaces/BuildInterfaces";
const { logger } = require('./Utils');
const ArgParser = require("./ArgParser");

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

class AzureDevOps {

    constructor(options) {
        this.credentails = ArgParser.getConfig();
    }

    async getAllBuilds(url, buildName) {
        // your collection url
        const orgUrl = "https://dev.azure.com/adoptopenjdk"; // TODO: Paramatrize
        const token = "x6jnbww5z532uu7qveddm2rcnyk7nzgy5rrscyibyvcrac26i6iq"; // TODO: Obtain PAT and paramaterize here.
        const authHandler = azdev.getPersonalAccessTokenHandler(token);
        const connection = new azdev.WebApi(orgUrl, authHandler);

        const build = await connection.getBuildApi();
        const project = "AdoptOpenJDK"; // TODO: Paramatrize.
        const defs = await build.getDefinitions(project);

        const testApiObject = await connection.getTestApi();
        const coreApiObject = await connection.getCoreApi();
        const teamProject = await coreApiObject.getProject(project);

        const runs = await testApiObject.getTestRuns(project);
        console.log('Current Runs:', runs);

        console.log(`dsfsgf***********${defs[0].name} (${defs[0].id}) ${defs[0].authoredBy.displayName}`);
        console.log('Code coverage for build' + defs[0].id + ':', await testApiObject.getCodeCoverageSummary(project, defs[0].id));

        // defs.forEach(async defRef => {
        //     console.log(`dsfsgf***********${defRef.name} (${defRef.id}) ${defRef.authoredBy.displayName}`);
        //     console.log('Code coverage for build' + defRef.id + ':', await testApiObject.getCodeCoverageSummary(project, defRef.id));
        // });

        // const builds = await build.getBuilds(project);
        // builds.forEach(b => {
        //     console.log("builds url: ", b.url);
        // });



    //common.heading('Get code coverage');
    //const buildApiObject = await connection.getBuildApi();
    //const defs2 = await buildApiObject.getDefinitions(project);
   


        // const logs = await build.getBuildLogs(project, 61);
        // logs.forEach(log => {
        //     console.log("log", log);
        // });
    }

    // async getBuildOutput(url, buildName, buildNum) {
    //     const newUrl = this.addCredential(url);
    //     const jenkins = jenkinsapi.init(newUrl, options);
    //     const console_output = retry(jenkins.console_output);
    //     const { body } = await console_output(buildName, buildNum);
    //     return body;
    // }

    // async getBuildInfo(url, buildName, buildNum) {
    //     const newUrl = this.addCredential(url);
    //     const jenkins = jenkinsapi.init(newUrl, options);
    //     const build_info = retry(jenkins.build_info);
    //     const body = await build_info(buildName, buildNum);
    //     return body;
    // }

    // async getLastBuildInfo(url, buildName) {
    //     const newUrl = this.addCredential(url);
    //     const jenkins = jenkinsapi.init(newUrl, options);
    //     const last_build_info = retry(jenkins.last_build_info);
    //     const body = await last_build_info(buildName);
    //     return body;
    // }

    // addCredential(url) {
    //     if (this.credentails) {
    //         if (this.credentails.hasOwnProperty(url)) {
    //             const user = encodeURIComponent(this.credentails[url].user);
    //             const password = encodeURIComponent(this.credentails[url].password);
    //             const tokens = url.split("://");
    //             if (tokens.length == 2 && user && password) {
    //                 url = `${tokens[0]}://${user}:${password}@${tokens[1]}`;
    //             }
    //         }
    //     }
    //     return url;
    // }

    // getBuildParams(buildInfo) {
    //     let params = null;
    //     if (buildInfo && buildInfo.actions) {
    //         for (let action of buildInfo.actions) {
    //             if (action.parameters && action.parameters.length > 0) {
    //                 params = action.parameters;
    //                 break;
    //             }
    //         }
    //     }
    //     return params;
    // }
}

module.exports = AzureDevOps;