async function start() {
  if (!navigator.gpu) {
    fail("this browser does not support WebGPU");
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    fail("this browser supports webGPU but it appears disabled");
    return;
  }
  const device = await adapter?.requestDevice();
  device.lost.then((info) => {
    console.error(`WebGPU device was lost: ${info.message}`);
    // 'reason' will be 'destroyed' if we intentionally destroy the device.
    if (info.reason !== "destroyed") {
      // try again
      start();
    }
  });
  main(device);
}

async function main(device) {
  // Get a WebGPU context from the canvas and configure it
  const canvas = document.querySelector("canvas");
  const context = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
  });

  const module = device.createShaderModule({
    label: "uniform triangle shaders",
    code: `
        struct OurStruct {
          color: vec4f,
          offset: vec2f,
        };

        struct OtherStruct {
          scale: vec2f,
        };

       

        @group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
        @group(0) @binding(1) var<storage, read> otherStructs: array<OtherStruct>;

        struct VSOutput {
          @builtin(position) position: vec4f,
          @location(0) color: vec4f,
        }

        @vertex fn vs (
          @builtin(vertex_index) vertexIndex : u32,
          @builtin(instance_index) instanceIndex: u32
        ) -> VSOutput {
          let pos = array(
            vec2f( 0.0,  0.5),  // top center
            vec2f(-0.5, -0.5),  // bottom left
            vec2f( 0.5, -0.5)   // bottom right        
          );

          let otherStruct = otherStructs[instanceIndex];
          let ourStruct = ourStructs[instanceIndex];

          var vsOut: VSOutput;
          vsOut.position = vec4f(
            pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
          vsOut.color = ourStruct. color;
          return vsOut;
        }

        @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
          return vsOut.color;
        }
      `,
  });

  const pipeline = device.createRenderPipeline({
    label: "Multi-Triangle Pipline",
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format: presentationFormat }],
    },
  });

  const kNumObjects = 100;
  const objectInfos = [];

  // Create 2 storage buffers
  const staticUnitSize =
    4 * 4 + // color is 4 32bit floats (4bytes each)
    2 * 4 + // scale is 2 32bit floats (4bytes each)
    2 * 4; // padding

  const changingUnitSize = 2 * 4; //scale is 2 32bit floats (4bytes each)

  const staticStorageBufferSize = staticUnitSize * kNumObjects;
  const changingStorageBufferSize = changingUnitSize * kNumObjects;

  const staticStorageBuffer = device. createBuffer({
    label: 'static storage for objects',
    size: staticStorageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });


  const changingStorageBuffer = device.createBuffer({
    label: 'changing storage for objects',
    size: changingStorageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // offsets to the various storage values in float32 indices
  const kColorOffset = 0;
  const kOffsetOffset = 4;

  const kScaleOffset = 0;

  {
    const staticStorageValues = new Float32Array(staticStorageBufferSize/4);
    for(let i=0; i<kNumObjects;++i){
      const staticOffset = i*(staticUnitSize/4);
      // These are only set once, so set them now
      // set color
      staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);
      // set offset
      staticStorageValues.set([rand(-0.9,0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);

      objectInfos.push ({
        scale: rand(0.2, 0.5),
      });
    }
    device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
  }
  // a typed array we can use to update the changingStorageBuffer
  const storageValues = new Float32Array(changingStorageBufferSize/4);

  const bindGroup = device.createBindGroup({
    label: 'bind group for objects',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: staticStorageBuffer }},
      {binding: 1, resource: {buffer: changingStorageBuffer }},
    ],
  });

  const renderPassDescriptor = {
    label: "our basic canvas renderPass",
    colorAttachments: [
      {
        // view: <- to be filled out when we render
        clearValue: [0.3, 0.3, 0.3, 1],
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  function render() {
    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    renderPassDescriptor.colorAttachments[0].view = 
      context.getCurrentTexture().createView();

    // make a command encoder to start encoding commands
    const encoder = device.createCommandEncoder();

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);

    // Get Canvas Aspect
    const aspect = canvas.width / canvas.height;
    
    // Set the scales for each object
    objectInfos.forEach(({scale}, ndx) => {
      const offset = ndx * (changingUnitSize/4);
      // set scale
      storageValues.set([scale/aspect, scale], offset + kScaleOffset);
    });

    // upload all scales at once
    device.queue.writeBuffer(changingStorageBuffer, 0, storageValues);

    pass.setBindGroup(0, bindGroup);
    // call our vertex shader 3 times for each instacne
    pass.draw(3, kNumObjects);

    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target;
      const width = entry.contentBoxSize[0].inlineSize;
      const height = entry.contentBoxSize[0].blockSize;
      canvas.width = Math.max(
        1,
        Math.min(width, device.limits.maxTextureDimension2D)
      );
      canvas.height = Math.max(
        1,
        Math.min(height, device.limits.maxTextureDimension2D)
      );
      // re-render
      render();
    }
  });
  observer.observe(canvas);
}

// A random number between [min and max)
//  with 1 argument it will be [0 to min)
// no arguments it will be [0 to 1)
const rand = (min, max) => {
  if (min === undefined) {
    min = 0;
    max = 1;
  } else if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.random() * (max - min);
};

function fail(msg) {
  // eslint-disable-next-line no-alert
  alert(msg);
}

start();
