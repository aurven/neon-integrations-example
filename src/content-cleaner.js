const utils = require('./helpers/utils.js');
const neon = require('./helpers/neon-bo-api.js');



async function cleanupRefs(familyRefs = []) {
  await neon.login();

  return await familyRefs.reduce((promiseAcc, id) => {
      console.log('Deleting ID:' + id);

      return promiseAcc.then(async () => {
          return await neon.deleteNode(id, true);
      });
  }, Promise.resolve())
      .finally(() => {
          neon.logout();
      });  
}


module.exports = {
  cleanupRefs
};