const winston = require('winston');
const logLevel = process.env.LOG_LEVEL || 'debug';

const tsFormat = () => new Date().toLocaleTimeString();
const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            timestamp: tsFormat,
            colorize: true, // colorize the output to the console
            level: logLevel, // error|warn|info|verbose|debug|silly
        }),
    ],
});

const addCredential = (credentails, url) => {
    if (credentails) {
        for (const k in credentails) {
            if (url.startsWith(k)) {
                const user = encodeURIComponent(credentails[k].user);
                const password = encodeURIComponent(credentails[k].password);
                const tokens = url.split('://');
                if (tokens.length == 2 && user && password) {
                    return `${tokens[0]}://${user}:${password}@${tokens[1]}`;
                }
            }
        }
    }
    return url;
};

const getParams = query => {
    if (!query) {
        return {};
    }
    return (/^[?#]/.test(query) ? query.slice(1) : query).split('&').reduce((params, param) => { let [key, value] = param.split('='); params[key] = value ? decodeURIComponent(value.replace(/\+/g, ' ')) : ''; return params; }, {});
};

module.exports = { logger, addCredential, getParams };
