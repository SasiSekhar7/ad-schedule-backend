const axios = require('axios')

const api = axios.create({
    baseURL:'https://cpaas.messagecentral.com/verification/v3'
    // baseURL:'http://localhost:8000'


})

const authToken = process.env.AUTH_TOKEN;
api.interceptors.request.use(
    async (config) => {
        // Add Authorization token to the headers
        if (authToken) {
            config.headers['authToken'] = authToken;
        }
        return config;
    },
    (error) => {
        // Handle request errors
        console.error('Request error:', error.message);
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response)=>{
        return response.data;
    }
);


module.exports = api;