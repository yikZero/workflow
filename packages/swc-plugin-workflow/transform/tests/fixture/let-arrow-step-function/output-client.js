/**__internal_workflows{"steps":{"input.js":{"exportedStepArrow":{"stepId":"step//input.js//exportedStepArrow"},"normalStep":{"stepId":"step//input.js//normalStep"},"stepArrow":{"stepId":"step//input.js//stepArrow"}}}}*/;
let stepArrow = async ()=>{
    return 1;
};
stepArrow.stepId = "step//input.js//stepArrow";
export let exportedStepArrow = async ()=>{
    return 2;
};
exportedStepArrow.stepId = "step//input.js//exportedStepArrow";
export async function normalStep() {
    return 3;
}
normalStep.stepId = "step//input.js//normalStep";
