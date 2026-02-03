import { createConfig } from "some-library";
var config$level1$level2$level3$myStep = async (input)=>{
    return input * 2;
};
// Test deeply nested step functions (4 levels deep)
export const config = createConfig({
    level1: {
        level2: {
            level3: {
                myStep: async (input)=>{
                    return input * 2;
                }
            }
        }
    }
});
config$level1$level2$level3$myStep.stepId = "step//input.js//config/level1/level2/level3/myStep";
