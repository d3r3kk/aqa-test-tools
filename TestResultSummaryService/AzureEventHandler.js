const Promise = require('bluebird');
const AzureBuildProcessor = require('./AzureBuildProcessor');
const BuildMonitor = require('./BuildMonitor');
const AzureBuildMonitor = require( './AzureBuildMonitor' );
const { TestResultsDB, BuildListDB, AuditLogsDB } = require('./Database');
const { logger } = require('./Utils');
const { getCIProviderName, getCIProviderObj } = require(`./ciServers`);

const elapsed = [2 * 60, 5 * 60, 30 * 60];
/*
 * EventHandler processes builds that have status != Done
 * Once all builds are in status Done, it delays the process based on the time in elapsed array
 */
class AzureEventHandler {
    async processBuild() {
        let count = 0;
        // break if all builds are done for consecutively 5 queries
        while (true) {
            try {
                const testResults = new TestResultsDB();
                let tasks = await testResults
                    .getData({ status: { $ne: 'Done' } })
                    .toArray();

                if (!tasks || tasks.length === 0) {
                    count++;
                } else {
                    count = 0;
                }

                for (let task of tasks) {
                    try {
                        const azureBuildProcessor = new AzureBuildProcessor();
                        //205 is a job
                        await azureBuildProcessor.execute(tasks[205]);
                    } catch (e) {
                        logger.error('Exception in BuildProcessor: ', e);
                        await new AuditLogsDB().insertAuditLogs({
                            action: '[exception] ' + e,
                            ...task,
                        });
                    }
                    logger.debug(
                        'EventHandler: processBuild() is waiting for 2 secs before processing the next build'
                    );
                    //await Promise.delay(2 * 1000);
                    await Promise.delay(1000*1000);
                }
            } catch (e) {
                logger.error('Exception in database query: ', e);
                await new AuditLogsDB().insertAuditLogs({
                    action: '[exception] ' + e,
                    ...task,
                });
            }
            const elapsedTime = elapsed[Math.min(count, elapsed.length - 1)];
            logger.verbose(
                `EventHandler: processBuild() is waiting for ${elapsedTime} secs before checking DB for builds != Done`
            );
            await Promise.delay(elapsedTime * 1000);
        }
    }

    //this function monitors build in Jenkins
    async monitorBuild() {
        while (true) {
            try {
                const testResults = new BuildListDB();
                let tasks = await testResults.getData().toArray();
                //tasks = tasks.filter((task) => task.monitoring === 'Yes');
                if (tasks && tasks.length > 0) {
                    for (let task of tasks) {
                        try {
                            const buildMonitor = new BuildMonitor();
                            // TODO: fix deleteOldBuilds 
                            await buildMonitor.deleteOldBuilds(task);
                            await buildMonitor.deleteOldAuditLogs();
                            const { buildUrl, type } = task;
                            if (!buildUrl || !type) {
                                logger.error("BuildMonitor: Invalid buildUrl and/or type", buildUrl, type);
                            } else {
                                const server = getCIProviderName(buildUrl);
                                if (server === "Azure") { // TODO: fix this to be more generic
                                    const azureBuildMonitor = new AzureBuildMonitor();
                                    //await azureBuildMonitor.execute( task, 5 );
                                } else { // TODO: there should be an analogous 'Jenkins' flow (or not any difference that depends on ciProvider)
                                    await buildMonitor.execute( task, 5 );
                                }
                            }
                        } catch (e) {
                            logger.error('Exception in BuildMonitor: ', e);
                            await new AuditLogsDB().insertAuditLogs({
                                action: '[exception] ' + e,
                                ...task,
                            });
                        }
                    }
                }
            } catch (e) {
                logger.error('Exception in database query: ', e);
                await new AuditLogsDB().insertAuditLogs({
                    action: '[exception] ' + e,
                    ...task,
                });
            }
            const elapsedTime = 15 * 60;
            logger.verbose(
                `EventHandler: monitorBuild() is waiting for ${elapsedTime} secs`
            );
            await Promise.delay(1000);
        }
    }
}
module.exports = AzureEventHandler;
