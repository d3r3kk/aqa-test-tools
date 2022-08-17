import React, { Component } from 'react';
import { Table } from 'antd';
import TestBreadcrumb from './TestBreadcrumb';
import { SearchOutput } from '../Search/';
import { getParams, params } from '../utils/query';
import { fetchData } from '../utils/Utils';
import BuildTable from './BuildTable';
import TopLevelBuildTable from './TopLevelBuildTable';

export default class BuildDetail extends Component {
    state = {
        builds: [],
        parent: [],
        tBuilds: [],
    };

    async componentDidMount() {
        await this.updateData();
        this.intervalId = setInterval(() => {
            this.updateData();
        }, 5 * 60 * 1000);
    }

    async componentDidUpdate(prevProps) {
        if (prevProps.location.search !== this.props.location.search) {
            await this.updateData();
        }
    }

    componentWillUnmount() {
        clearInterval(this.intervalId);
    }

    async updateData() {
        const { parentId, buildResult, testSummaryResult, buildNameRegex } =
            getParams(this.props.location.search);
        let builds;
        if (testSummaryResult || buildNameRegex || buildResult) {
            builds = await fetchData(
                `/api/getAllChildBuilds${params({
                    buildResult,
                    testSummaryResult,
                    buildNameRegex,
                    parentId,
                })}`
            );
        } else {
            builds = await fetchData(
                `/api/getChildBuilds?parentId=${parentId}`
            );
        }

        const parent = await fetchData(`/api/getData?_id=${parentId} `);

        const triggeredBuildIds = parent[0].triggeredBuildIds;
        console.log(triggeredBuildIds);
        const tBuilds = [];
        const tPpls = [];
        for (let tId of triggeredBuildIds)
        {
            const tBuild = await fetchData(`/api/getTriggeredBuild?buildNum=${tId} `);
            if(!tPpls.includes(tBuild[0].buildName))
            {
                tBuilds.push(tBuild);
                tPpls.push(tBuild[0].buildName);
            }
            
        }
        // const tBuild = await fetchData(
        //     //`/api/getChildBuilds?parentId=${tId}`
        //     `/api/getTriggeredBuild?type=Test&tId=${tId}`
        // );
        // //const tBuild = tId;

        this.setState({ builds, parent,tBuilds });
    }

    render() {
        const { builds, parent, tBuilds } = this.state;
        const { parentId } = getParams(this.props.location.search);

        const childBuildsDataSource = [];
        for (let i = 0; i < builds.length; i++) {
            // Data from the DB get placed into what get rendered in the frontend
            childBuildsDataSource.push({
                key: i,
                buildData: {
                    _id: builds[i]._id,
                    buildName: builds[i].buildNameStr
                        ? builds[i].buildNameStr
                        : builds[i].buildName,
                    buildNum: builds[i].buildNum,
                    buildResult: builds[i].buildResult,
                    buildUrl: builds[i].buildUrl,
                    type: builds[i].type,
                    hasChildren: builds[i].hasChildren, // Add has children into database 
                },
                jenkinsBuild: {
                    buildName: builds[i].buildNameStr, // switched to buildNameStr
                    buildNum: builds[i].buildNum,
                    //buildUrl: builds[i].buildUrl,
                    buildUrl: "https://dev.azure.com/ms-juniper/Juniper/_build/results?buildId=" + builds[i].buildNum + "&view=logs&s=" + builds[i].subId,
                    url: builds[i].url,
                },
                result: {
                    _id: builds[i]._id,
                    buildResult: builds[i].buildResult,
                },
                resultDetail: builds[i].testSummary,
                date: builds[i].timestamp
                    ? new Date(builds[i].timestamp).toLocaleString()
                    : null,
                comments: builds[i].comments,
                //triggeredBuildIds: builds[i].triggeredBuildIds,
            });
        }

        const parentBuildColumns = [
            {
                title: 'Build Info',
                dataIndex: 'buildInfo',
                key: 'buildInfo',
            },
            {
                title: 'SHA',
                dataIndex: 'sha',
                key: 'sha',
            },
        ];
        const parentBuildsDataSource = [];
        let buildName = '';
        let triggeredBuildIds = [];
        if (parent && parent[0]) {
            let i = 0;
            for (let key in parent[0].buildData) {
                parentBuildsDataSource.push({
                    key: i++,
                    buildInfo: key,
                    sha: parent[0].buildData[key],  
                });
            }
            buildName = parent[0].buildName;
            parentBuildsDataSource.push({triggeredBuildIds: parent[0].triggeredBuildIds})
            //triggeredBuildIds = parent[0].triggeredBuildIds;
        }


        return (
            <div>
                <TestBreadcrumb buildId={parentId} />
                <SearchOutput buildId={parentId} />
                <Table
                    columns={parentBuildColumns}
                    dataSource={parentBuildsDataSource}
                    bordered
                    title={() => buildName}
                    pagination={false}
                />
                <br />
                <BuildTable
                    title={'Children builds'}
                    buildData={childBuildsDataSource}
                />

                {/*Table for triggered builds*/}
                {tBuilds.map((tBuild, i) => {                    
                            
                                    console.log(tBuild);
                                    return (     
                                        <TopLevelBuildTable
                                            url={tBuild[0].url} // url of triggered build
                                            buildName={tBuild[0].buildName} // name of the triggered name
                                            type="Build"
                                            key={i}
                                        />
                                    );
                                })
                }
            </div>
        );
    }
}
