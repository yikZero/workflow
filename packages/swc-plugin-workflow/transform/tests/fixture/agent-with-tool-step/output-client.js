import { agent } from "experimental-agent";
var vade$tools$VercelRequest$execute = async (input, { experimental_context })=>{
    return 1 + 1;
};
export const vade = agent({
    tools: {
        VercelRequest: {
            execute: async (input, { experimental_context })=>{
                return 1 + 1;
            }
        }
    }
});
vade$tools$VercelRequest$execute.stepId = "step//input.js//vade/tools/VercelRequest/execute";
