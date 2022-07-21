const Azure = require('../ciServers/Azure');
module.exports = async (req, res) => {
    const { url } = req.query;
    const azure = new Azure();

    //http://localhost:3001/api/getAzure?url=https://dev.azure.com/adoptopenjdk/AdoptOpenJDK&definitionId=3
    const { definitionId } = req.query;
    //const output = await azure.getAllBuilds(url, definitionId);

    //http://localhost:3001/api/getAzure?url=https://dev.azure.com/adoptopenjdk/AdoptOpenJDK&buildNum=58
    const { buildNum } = req.query;
    // const output = await azure.getTimelineRecords(url, buildNum);

    const task = {
        url: "https://dev.azure.com/adoptopenjdk/AdoptOpenJDK",
        buildNum: 58,
        result: null,
        buildNameStr: "OpenJDK Sanity Check jdk_util",
        duration: 691363,
        timestamp: 1579789379230,
        building: null,
        subId: "69028a9b-cb76-5f9d-f3b1-252add704978",
        azure: {
            previousAttempts: [],
            id: "69028a9b-cb76-5f9d-f3b1-252add704978",
            parentId: "f7fe6243-d407-5e1f-60e7-7f97319d3b55",
            type: "Job",
            name: "OpenJDK Sanity Check jdk_util",
            startTime: "2020-01-23T14:22:59.230Z",
            finishTime: "2020-01-23T14:34:30.593Z",
            currentOperation: null,
            percentComplete: null,
            state: 2,
            result: 0,
            resultCode: null,
            changeId: 435,
            lastModified: "0001-01-01T05:17:32.000Z",
            workerName: "Azure Pipelines 5",
            queueId: 27,
            order: 5,
            details: null,
            errorCount: 0,
            warningCount: 0,
            url: null,
            log: {
                id: 278,
                type: "Container",
                url: "https://dev.azure.com/adoptopenjdk/e8ffe62c-7ce3-400b-b08f-80fb2105487f/_apis/build/builds/58/logs/278"
            },
            task: null,
            attempt: 1,
            identifier: "Test_macOS.openjdk_sanity.jdk_util"
        }
    };
    const output = await azure.getBuildOutput(task);
   // console.log("output", output.keys);
    res.send(output);
}