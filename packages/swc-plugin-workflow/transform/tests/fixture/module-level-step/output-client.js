import { registerStepFunction } from "workflow/internal/private";
/**__internal_workflows{"steps":{"input.js":{"step":{"stepId":"step//input.js//step"},"stepArrow":{"stepId":"step//input.js//stepArrow"}}}}*/;
export async function step(input) {
    return input.foo;
}
export const stepArrow = async (input)=>{
    return input.bar;
};
registerStepFunction("step//input.js//step", step);
registerStepFunction("step//input.js//stepArrow", stepArrow);
