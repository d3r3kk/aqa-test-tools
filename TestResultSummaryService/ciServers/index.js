const providers = {
    Azure: require(`./Azure`),
    Jenkins: require(`./Jenkins`),
};


module.exports = {
    getCIProviderName(buildUrl) {
        const keys = Object.keys(providers);
        for (let i = 0; i < keys.length; i++) {
            const server = keys[i];
            if (providers[server].matchServer(buildUrl)) {
                return server;
            }
        }
    },

    getCIProviderObj(key) {
        return new providers[key]();

    }
};