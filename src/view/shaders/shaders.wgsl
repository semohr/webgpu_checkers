// Everything static in the scene (lighting, projection)
struct PointLight {
    position : vec3f, // offset(0) align(16) size(12)
    color : vec3f, // offset(16) align(16) size(12)
};
struct LightStorage {
    pointCount : u32, // offset(0) align(4) size(4)
    @align(16) point : array<PointLight> // offset(16) align(16) size(24)
};
@group(0) @binding(0) var<storage> lights : LightStorage;
@group(0) @binding(1) var<uniform> time : f32;

struct Camera {
    projection : mat4x4f,
    view : mat4x4f,
    pos: vec4f,
};
@group(1) @binding(0) var<uniform> camera : Camera;



// Texture, sampler and everything regarding the current vertices
@group(2) @binding(0) var baseColorSampler : sampler;
@group(2) @binding(1) var baseColorTexture : texture_2d<f32>;
@group(2) @binding(2) var<storage> instanceBuffer : array<mat4x4f>; // Model matrix for each instance
@group(2) @binding(3) var<storage> highlightBuffer : array<u32>; // Model matrix for each instance

// The remainder of this shader doesn't affect the bind groups.
struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) texcoord : vec2f,
    @location(1) normal : vec3f,
    @location(2) instanceID : u32,
};


@vertex 
fn vertexMain(
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



@fragment
fn fragmentMain(
    fragData: VertexOutput
) -> @location(0) vec4f {
    // Sample the base color of the surface from a texture.
    var baseColor = textureSample(baseColorTexture, baseColorSampler, fragData.texcoord);

    let N = normalize(fragData.normal.xyz);
    let viewDir = normalize(camera.pos - fragData.position);
    var surfaceColor = vec3f(0.2);

    // directional light from top
    let lightDir = normalize(vec3f(0.0, 0.0, 1.0));
    let diff = max(dot(N, lightDir), 0.0);
    let ambient = vec3f(0.1) * 1.0;
    let diffuse = vec3f(1.) * diff * 0.8;
    let result = ambient + diffuse;
    surfaceColor += result;

    // point lights
    for (var i = 0u; i < lights.pointCount; i++) {
        surfaceColor += calcPointLight(fragData, lights.point[i], N, viewDir.xyz);
    }

    // Apply the base color to the surface.
    surfaceColor *= baseColor.rgb;

    // Hihglight blinking
    if (highlightBuffer[fragData.instanceID] == 1u) {
         // Oscillate alpha between 0.5 and 1 ease in and out
        let alpha = 0.5 + 0.5 * abs(sin(time * 3.));
        surfaceColor += vec3f(0.8, 0.1, 0.1) * alpha;
    }

    // Preview of turn

    // Return the accumulated surface color.
    return vec4f(surfaceColor, baseColor.a);
}


fn calcPointLight(fragData: VertexOutput, light: PointLight, N: vec3f, viewDir: vec3f) -> vec3f {
    // Add as group at some point
    let DIFFUSE = vec3f(1.0) * light.color.rgb;
    let AMBIENT = vec3f(1.0) * light.color.rgb;
    let SPECULAR = vec3f(1.0) * light.color.rgb;
    let SHININESS = 100.0;
    // point let config (could also be moved to a storage buffer)
    let CONSTANT = 1.0;
    let LINEAR = 0.09;
    let QUARDRATIC = 0.032;

    let lightDir = normalize(light.position.xyz - fragData.position.xyz);
    // diffuse shading
    let diff = max(dot(N, lightDir), 0.0);
    // specular shading
    let reflectDir = reflect(-lightDir, N);
    let spec = pow(max(dot(viewDir, reflectDir), 0.0), SHININESS);
    // attenuation
    let distance = length(light.position.xyz - fragData.position.xyz) / 80.0;
    let attenuation = 1.0 / (CONSTANT + LINEAR * distance + QUARDRATIC * (distance * distance));

    // combine results
    var ambient = AMBIENT  * 1.0 * attenuation;
    var diffuse = DIFFUSE * diff * 1.0 * attenuation;
    var specular = SPECULAR * spec * 1.0 * attenuation;

    let result = ambient + diffuse + specular;
    return result;
}