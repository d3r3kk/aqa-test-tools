// const { query } = require('winston');
// const { TestResultsDB, ObjectID } = require('../Database');
// module.exports = async (req, res) => {
    
//     let query = {};
//     query.parentId = { $exists: false };
//     if (req.query.buildNum)
//         req.query.buildNum = parseInt(req.query.buildNum, 10);

//     const db = new TestResultsDB();


//     let result = await db.aggregate([
//         {
//             $match: query,
//         },
//         {
//             $group: {
//                 _id: {
//                     url: '$url',
//                     buildName: '$buildName',
//                 },
//             },
//         },
//         {
//             $sort: { _id: 1 },
//         },
//     ]);
//     res.send(result);
// };


const { TestResultsDB, ObjectID } = require('../Database');
module.exports = async (req, res) => {
    if (req.query.buildNum)
        req.query.buildNum = parseInt(req.query.buildNum, 10);
    req.query.parentId = { $exists: false };
    const db = new TestResultsDB();
    const result = await db.getData(req.query).toArray();
    res.send(result[0]);
};
