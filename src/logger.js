const { Logger, ConsoleTransport } = require('@logzio-node-toolbox/logger');

const transporter = new ConsoleTransport();
module.exports.transporter = transporter;
module.exports.logger = new Logger({
  transports: [transporter],
});
