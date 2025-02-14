// ASYNC FUNCTION
async function createObjectsRenderBlue() {
    var msg_array = ["<h1>Ch02_ObjectCreation</h1>"];
    // Check WebGPU Support
    if(!navigator.gpu) {
        throw new Error("WebGPU not supported");
    } else {
        msg_array.push("WebGPU supported");
    }
    // Access GPU Adapter
    const adapter = await navigator.gpu.requestAdapter();
    if(!adapter){
        throw new Error("No GPU Adapter found");
    } else {
        msg_array.push("GPU Adapter found");
    }
    // Access GPU Device
    const device = await adapter.requestDevice();
    if(!device) {
        throw new Error("Failed to create GPU Device")
    } else {
        msg_array.push("GPU Device created");
    }
    // Create Command Encoder
    cmdEncoder = device.createCommandEncoder();
    if(!cmdEncoder) {
        throw new Error("Failed to create Command Encoder");
    } else {
        msg_array.push("GPU Command Encoder created");
    }
    //Access Canvas
    const canvas = document.getElementById("canvas_0");
    if(!canvas) {
        throw new Error("Could not access html canvas");
    } else {
        msg_array.push("Accessed Canvas in html");
    }
    // Obtain a WebGPU canvas context
    const context = canvas.getContext("webgpu");
    if(!context) {
        throw new Error("Could not obtain WebGOU Canvas Context");
    } else {
        msg_array.push("Obtained WebGPU context for canvas");
    }
    //Get the best pixel format
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    // Configure the context with the device and format
    context.configure({
        device: device,
        format: canvasFormat,
    });

    //Render Pass
    const renderPass = cmdEncoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: {r: 0.2, g: 0.2, b: 1.0, a: 1.0},
            storeOp: "store"
        }]
    });
    //Complete Render Pass encoding
    renderPass.end();

    //Submit the render commands to the GPU
    device.queue.submit([cmdEncoder.finish()]);

}

// Call function
createObjectsRenderBlue();