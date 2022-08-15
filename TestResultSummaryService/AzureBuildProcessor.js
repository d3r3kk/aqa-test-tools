const DataManager = require('./DataManager');
const AzureDataManager = require('./AzureDataManager')
const LogStream = require('./LogStream');
const ObjectID = require('mongodb').ObjectID;
const { TestResultsDB, OutputDB, AuditLogsDB } = require('./Database');
const { logger } = require('./Utils');
const plugins = require('./plugins');
const { getCIProviderName, getCIProviderObj } = require(`./ciServers`);

class BuildProcessor {
    async execute(task) {
        const { url, buildName, buildNum } = task;
        if (!task.server) {
            task.server = getCIProviderName(url);
        }
        const ciServer = getCIProviderObj(task.server);

        if (url && (url.endsWith('job') || url.endsWith('job/'))) {
            let tokens = url.split('job');
            tokens.pop();
            url = tokens.join('job');
        }
        let task_input = [task.url, task.buildName, task.buildNum, task.subId]
        //const buildInfo = await ciServer.getBuildInfo(task);
        const buildInfo = await ciServer.getBuildInfo(task_input);


        if (buildInfo) {
            if (buildInfo.code === 404) {
                /*
                 * Return code is 404. The url is invalid or the build does not
                 * exist on Jenkins any more, just set status to Done and store
                 * the build info
                 */
                task.status = 'Done';
                await new AzureDataManager().updateBuild(task);
                return;
            }
            task.buildParams = ciServer.getBuildParams(buildInfo);
            let output = '';
            if (task.status === 'Streaming') {
                if (!buildInfo.building) {
                    await this.processBuild(task, buildInfo, ciServer);
                } else {
                    const date = new Date();
                    const currentTime = date.getTime();
                    let minutes = 6;
                    if (task.lastQueried) {
                        const diff = Math.abs(currentTime - task.lastQueried);
                        // round to minutes
                        minutes = Math.floor(diff / 1000 / 60);
                    }
                    if (minutes > 5) {
                        let startPtr = 0;
                        // if output exists, get last position from output and continue
                        // streaming. Otherwise, create build.
                        if (task.buildOutputId) {
                            const outputDB = new OutputDB();
                            const result = await outputDB
                                .getData({
                                    _id: new ObjectID(task.buildOutputId),
                                })
                                .toArray();

                            if (result && result.length === 1) {
                                startPtr = result[0].output.length;
                                output = result[0].output;
                            } else {
                                throw new Error(
                                    'outputDB.getData cannot find match',
                                    result
                                );
                            }
                        }

                        let chunk = '';
                        try {
                            const logStream = new LogStream({
                                baseUrl: url,
                                job: buildName,
                                build: buildNum,
                            });
                            chunk = await logStream.next(startPtr);
                        } catch (e) {
                            logger.error('BuildProcessor: ', e.toString());
                            logger.error('Cannot get log stream ', task);

                            await new AuditLogsDB().insertAuditLogs({
                                action: '[exception] ' + e.toString(),
                                ...task,
                            });
                        }

                        // only update if there is more output
                        if (chunk) {
                            output += chunk;
                            logger.debug('startPtr', startPtr);
                            logger.silly('chunk', chunk);

                            task.output = output;
                            task.timestamp = buildInfo.timestamp;
                            task.buildUrl = buildInfo.url;
                            task.buildDuration = buildInfo.duration;
                            task.buildResult = buildInfo.result;
                            task.lastQueried = currentTime;
                            await new AzureDataManager().updateBuildWithOutput(task);

                            await new AuditLogsDB().insertAuditLogs({
                                action: '[streaming]: updateBuildWithOutput',
                                ...task,
                            });
                        }
                    }
                }
            } else if (task.status === 'NotDone') {
                //await this.processBuild(task, buildInfo, jenkinsInfo);
                await this.processBuild(task, buildInfo, ciServer);
            } else if (task.status === 'CurrentBuildDone') {
                // If all child nodes are done, set current node status to Done
                const testResultsDB = new TestResultsDB();
                const childBuilds = await testResultsDB
                    .getData({ parentId: task._id, status: { $ne: 'Done' } })
                    .toArray();
                if (childBuilds.length === 0) {
                    task.status = 'Done';
                    await new AzureDataManager().updateBuild({
                        _id: task._id,
                        status: task.status,
                    });
                    await new AuditLogsDB().insertAuditLogs({
                        action: '[updateBuildStatus]',
                        ...task,
                    });

                    await plugins.onBuildDone(task, { testResultsDB, logger });
                    await new AuditLogsDB().insertAuditLogs({
                        action: '[plugins]: onBuildDone',
                        ...task,
                    });
                }
            }
        }
    }
    async processBuild(task, buildInfo, ciServer) {
        // if the build is done, update the record in db.
        // else if no timestamp or buildUrl, update the record in db.
        // Otherwise, do nothing.
        if (buildInfo && !buildInfo.building && buildInfo.result !== null) {
            task.timestamp = buildInfo[0].timestamp;
            task.buildUrl = buildInfo.url;
            task.buildDuration = buildInfo[0].duration;
            task.buildResult = buildInfo[0].buildResult;
            task.status = 'CurrentBuildDone';
            let output = '';
            let msg = 'updateBuildWithOutput';
            try {
                output = await ciServer.getBuildOutput(task);
                if (output) {
                    console.log("output", output);
                    task.output = output;
                    await new AzureDataManager().updateBuildWithOutput(task);
                } else {
                    msg = 'Cannot get the output';
                    logger.warn(msg, task.url, task.buildName, task.buildNum);
                    task.error = msg;
                    await new AzureDataManager().updateBuild(task);
                }
                await new AuditLogsDB().insertAuditLogs({
                    action: `[processBuild]: ${msg}`,
                    ...task,
                });
            } catch (e) {
                logger.warn(
                    `BuildProcessor: processBuild(): Exception: ${e.toString()}`
                );
                task.error = e.toString();
                await new AzureDataManager().updateBuild(task);
            }
        } else if (!task.timestamp || !task.buildUrl) {
            await new AzureDataManager().updateBuild({
                _id: task._id,
                buildUrl: buildInfo.url,
                timestamp: buildInfo.timestamp,
                buildParams: task.buildParams,
            });
        }
    }
}
module.exports = BuildProcessor;
