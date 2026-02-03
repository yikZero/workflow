/**__internal_workflows{"steps":{"input.js":{"step":{"stepId":"step//input.js//step"},"stepArrow":{"stepId":"step//input.js//stepArrow"}}}}*/;
export async function step(input) {
    return input.foo;
}
step.stepId = "step//input.js//step";
export const stepArrow = async (input)=>{
    return input.bar;
};
stepArrow.stepId = "step//input.js//stepArrow";
