const { getCIProviderName, getCIProviderObj } = require(`../ciServers/`);
const fs = require('fs');

module.exports = async (req, res) => {
    const { url, buildName } = req.query;
    if (req.query.buildNum) {
        req.query.buildNum = parseInt(req.query.buildNum, 10);
    }
    const server = getCIProviderName(url);
    const ciServer = getCIProviderObj(server);
    try {
        const output = await ciServer.getBuildInfo(url, buildName, req.query.buildNum);
        const filename = "./output_getBuildInfo_" + Math.random();
        fs.writeFileSync(filename, output);
        res.send({ result: filename });
    } catch (e) {
        res.send({ result: e.toString() });
    }
};
