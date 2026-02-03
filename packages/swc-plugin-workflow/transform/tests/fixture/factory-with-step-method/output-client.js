import fs from 'fs/promises';
var myFactory$myStep = async ()=>{
    await fs.mkdir('test');
};
const myFactory = ()=>({
        myStep: async ()=>{
            await fs.mkdir('test');
        }
    });
export default myFactory;
myFactory$myStep.stepId = "step//input.js//myFactory/myStep";
