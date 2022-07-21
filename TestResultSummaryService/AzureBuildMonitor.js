const DataManager = require('./DataManager');
const { TestResultsDB, AuditLogsDB } = require('./Database');
const { logger } = require('./Utils');
const { getCIProviderName, getCIProviderObj } = require(`./ciServers`);
const Azure = require(`./ciServers/Azure`);

class AzureBuildMonitor {
    async execute(task, historyNum = 5) {
        let { buildUrl, type, streaming } = task;

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
        allBuilds.sort((a, b) => parseInt(b.id) - parseInt(a.id));
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
        for (let i = 0; i < limit; i++) {
            //("buildNum ", allBuilds[i]);
            const buildNum = parseInt(allBuilds[i].buildNum, 10);
            const buildsInDB = await testResults.getData({ url, buildName, buildNum }).toArray();
            if (!buildsInDB || buildsInDB.length === 0) {
                let status = "NotDone";
                if (streaming === "Yes" && allBuilds[i].result === null) {
                    status = "Streaming";
                    logger.info(`Set build ${url} ${buildName} ${buildNum} status to Streaming `);
                }

                const buildType = type === "FVT" ? "Test" : type;

                const parentId = await this.insertData({
                    url,
                    ...allBuilds[i],
                    type: buildType,
                    status
                });
                // insert all records in Azure timeline
                const timelineRecs = await ciServer.getTimelineRecords(url, buildNum);
                const extraData = {status, url, buildName, buildNum, type: buildType};
                await this.insertBuilds(timelineRecs, null, parentId, extraData);
            } else {
                break;
            }
        }
    }

    getChildrenByParentId(recArray, id) {
        return recArray.filter(rec => rec.azure.parentId === id );
        // const children = recArray.map( rec => {
        //     if (!rec) {
        //         console.log("getChildrenByParentId !rec", rec);
        //     }
        //     if (rec.azure ) {
        //         console.log("getChildrenByParentId", rec.azure.parentId, id);
        //         if (rec.azure.parentId === id) {
        //             console.log("getChildrenByParentId rec", rec);
        //             return rec;
        //         }
        //     }
        // });
        // console.log("getChildrenByParentId children", children);
        // return children;
    }

    async insertBuilds(recArray, azureParentId, trssParentId, extraData) {
        console.log("insertBuilds recArray", recArray.length, azureParentId);
        if (!recArray || recArray.length === 0) return;
        const children = this.getChildrenByParentId(recArray, azureParentId);
        for (let child of children) {
            const newTrssParentId = await this.insertData({
                parentId : trssParentId,
                ...child,
                ...extraData,
            });
            if (!child.subId) console.log("************error insertBuilds", child);
            await this.insertBuilds(recArray, child.subId, newTrssParentId, extraData);
        }
    }
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