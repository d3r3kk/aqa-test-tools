const { getCIProviderName, getCIProviderObj } = require(`../ciServers/`);
const Promise = require('bluebird');
module.exports = async (req, res) => {
    const { url, buildName } = req.query;
    const server = getCIProviderName(url);
    const ciServer = getCIProviderObj(server);
    const result = await ciServer.getLastBuildInfo(url, buildName);
    res.send({ result });
}
