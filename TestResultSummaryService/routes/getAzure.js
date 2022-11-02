const AzureDevOps = require('../AzureDevOps');
module.exports = async ( req, res ) => {
    if ( req.query._id ) req.query._id = new ObjectID( req.query._id );
    const azureDevOps = new AzureDevOps();
     await azureDevOps.getAllBuilds();
    res.send( {result: "done"} );
}
