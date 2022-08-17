const { getCIProviderName, getCIProviderObj } = require(`../ciServers/`);
const AzureBuildMonitor = require( '../AzureBuildMonitor' );
const fs = require('fs');
const AzureEventHandler = require('../AzureEventHandler')

module.exports = async (req, res) => {
    const { url, buildName } = req.query;
    if (req.query.buildNum) {
        req.query.buildNum = parseInt(req.query.buildNum, 10);
    }

    subId = null
    if(req.query.subId){
        subId = req.query.subId
    }
    const server = getCIProviderName(url);
    // if (server === "Azure") { // TODO: fix this to be more generic
    //     const type = "Test";
    //     const streaming = "Yes";
    //     //let { url, type, streaming } = task;
    //     const azureBuildMonitor = new AzureBuildMonitor();
    //     //await azureBuildMonitor.execute( task, 5 );
    //    await azureBuildMonitor.execute( [url, type, streaming], 2 );
    // }

    const handler = new AzureEventHandler();
    handler.processBuild();

    const ciServer = getCIProviderObj(server);
    // try {
    //     const output = await ciServer.getBuildInfo([url, buildName, req.query.buildNum, subId]);
    //     const filename = "./output_getBuildInfo_" + Math.random();
    //     fs.writeFileSync(filename, JSON.stringify(output));
    //     res.send({ result: filename });
    // } catch (e) {
    //     console.log(e)
    //     res.send({ result: e.toString() });
    // }
};
