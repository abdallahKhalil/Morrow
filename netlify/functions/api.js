const serverless = require('serverless-http')
const app = require('../../express-jwt-sqlite/src/app')

exports.handler = serverless(app)
