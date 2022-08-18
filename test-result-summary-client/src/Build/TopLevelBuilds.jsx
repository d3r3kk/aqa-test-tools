import React, { Component } from 'react';
import TopLevelBuildTable from './TopLevelBuildTable';
import { SearchOutput } from '../Search';
const { order, fetchData } = require('../utils/Utils');
export default class TopLevelBuilds extends Component {
    state = {
        currentPage: 1,
    };

    async componentDidMount() {
        await this.updateData(this.props.match.params.type);
        this.intervalId = setInterval(() => {
            this.updateData(this.props.match.params.type);
        }, 5 * 60 * 1000);
    }
    async componentDidUpdate(prevProps) {
        if (prevProps.match.params.type !== this.props.match.params.type) {
            await this.updateData(this.props.match.params.type);
        }
    }

    componentWillUnmount() {
        clearInterval(this.intervalId);
    }

    async updateData(type) {
        if (!type) type = 'Test';
        let results = '';
        if (type === 'Test') {
            results = await fetchData(
                `/api/getTopLevelBuildNames?type=${type}`
            );
        } else if (type === 'AQAvitCert') {
            results = await fetchData(
                `/api/getTopLevelBuildNames?type=Test&AQAvitCert=true`
            );
        }
        const builds = {};
        for (let i = 0; results && i < results.length; i++) {
            const url = results[i]._id.url;
            const buildName = results[i]._id.buildName;
            //const topResultSummary = results[i]._id.totalTestsSummary;
            builds[url] = builds[url] || [];
            builds[url].push(buildName);
        }

        // get the next release date
        // Script to get date of ordinal weekday.
        let year = 2022, month = 6, ordinal = 3, weekday = 'Tue' // Get date for first Sunday of August 2022
        let d = new Date(year, month, 1)
        const timeElapsed = Date.now();
        const today = new Date(timeElapsed);
        d = await this.updateReleaseDate(year, month)
        if(today > d)
        {
            let dmonth = d.getMonth();
            let dyear = dmonth < 9 ? d.getFullYear() : d.getFullYear + 1;
            dmonth += 3;
            d = await this.updateReleaseDate(dyear, dmonth);
        }

        

        console.log(ordinal, weekday, d)



        const releaseCntDown = String((d - today)/(1000 * 60 * 60 * 24)).slice(0,-15);
        const datee = String(d).slice(0, 15);
        this.setState({ builds, type, releaseCntDown, datee });
    }

    async updateReleaseDate(year, month){
        let ordinal = 3, weekday = 'Tue';
        let d = new Date(year, month, 1)
        d.setUTCHours(0, 0, 0, 0)
        const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].findIndex(x => x === weekday)

        const ORDINALCONST =
        7 * ordinal + dayOfWeek - d.getUTCDay() - (d.getUTCDay() <= dayOfWeek ? 7 : 0)

        d.setUTCDate(d.getUTCDate() + ORDINALCONST)
        return d;
    }

    render() {
        const { builds, type, releaseCntDown, datee } = this.state;

        if (builds && type) {
            return (
                <div>
                    <SearchOutput />
                    <h2>    {releaseCntDown} days until the next release {datee}!</h2>
                    {Object.keys(builds)
                        .sort()
                        .map((url, i) => {
                            return builds[url]
                                .sort(order)
                                .map((buildName, j) => {
                                    return (
                                        <TopLevelBuildTable
                                            url={url}
                                            buildName={buildName}
                                            type={type}
                                            key={j}
                                        />
                                    );
                                });
                        })}
                </div>
            );
        } else {
            return null;
        }
    }
}
