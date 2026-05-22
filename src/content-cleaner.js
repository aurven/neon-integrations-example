const utils = require('./helpers/utils.js');
const neon = require('./helpers/neon-bo-api-v3.js');



async function cleanupRefs(familyRefs = []) {
  return await familyRefs.reduce((promiseAcc, id) => {
      console.log('Deleting ID:' + id);

      return promiseAcc.then(async () => {
          return await neon.deleteNode(id, true);
      });
  }, Promise.resolve());
}


module.exports = {
  cleanupRefs
};