'use strict';

const connectors = {
  twitter:   require('./twitter-connector'),
  facebook:  require('./facebook-connector'),
  instagram: require('./instagram-connector'),
  threads:   require('./threads-connector'),
  bluesky:   require('./bluesky-connector'),
};

function getConnector(platform) {
  const connector = connectors[platform];
  if (!connector) throw new Error(`Unknown platform: ${platform}`);
  return connector;
}

function getAllConnectors() {
  return Object.values(connectors);
}

module.exports = { getConnector, getAllConnectors };
