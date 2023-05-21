struct Camera {
    projection : mat4x4f,
    view : mat4x4f,
    pos: vec4f,
};
@group(0) @binding(0) var<uniform> camera : Camera;


@group(1) @binding(0) var<uniform> pickUniform : u32; // Picking ID
@group(1) @binding(1) var<storage> instanceBuffer : array<mat4x4f>; // Model matrix for each instance

// The remainder of this shader doesn't affect the bind groups.
struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) texcoord : vec2f,
    @location(1) normal : vec3f,
    @location(2) instanceID : u32
};


@vertex 
fn pickingVertexMain(
    @builtin(instance_index) ID : u32,
    @location(0) position : vec3f,
    @location(1) texcoord : vec2f,
    @location(2) normal : vec3f,
) -> VertexOutput {
    var output : VertexOutput;
    // Todo determine model matrix via gameboard
    output.position = camera.projection * camera.view * instanceBuffer[ID] * vec4f(position, 1.0);
    output.texcoord = texcoord;
    output.normal = normal;
    output.instanceID = ID;
    return output;
}



struct ReturnFragment {
    @location(0) instance_id : u32,
    @location(1) pickID : u32
};

@fragment
fn pickingFragmentMain(
    fragData: VertexOutput
) -> ReturnFragment {
    var r : ReturnFragment;
    r.instance_id = fragData.instanceID;
    r.pickID = pickUniform;
    return r;
}
