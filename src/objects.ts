import { device, cameraUniformBuffer, lightDataBuffer } from './renderer';
import { mat4, vec3 } from 'gl-matrix';
import { lightDataSize } from './scene';


export class Vertex  {
    pos: number[];
    norm: number[];
    uv: number[];
}

export class Mesh {
    vertices: Vertex[] = [];
}

export function generatePlane(xSize: number, ySize: number, width: number, height: number): Mesh {
    const result = new Mesh();

    const normal = [0, 0, 1]

    const xstep = width / xSize;
    const ystep = height / ySize;

    for (let x = 0; x < width; x += xstep) {
        for (let y = 0; y < height; y += ystep) {

            const x0 = x;
            const y0 = y;
            const x1 = x0 + xstep;
            const y1 = y0 + ystep;
            
            result.vertices.push({
                pos: [x0, y0, 0],
                norm: normal,
                uv: [1 - x0 / width, 1 - y0 / height],
            });

            result.vertices.push({
                pos: [x1, y0, 0],
                norm: normal,
                uv: [ 1 - x1 / width, 1 - y0 / height],
            });

            result.vertices.push({
                pos: [x0, y1, 0],
                norm: normal,
                uv: [1 - x0 / width, 1 - y1 / height],
            });

            result.vertices.push({
                pos: [x0, y1, 0],
                norm: normal,
                uv: [1 - x0 / width, 1 - y1 / height],
            });

            result.vertices.push({
                pos: [x1, y0, 0],
                norm: normal,
                uv: [ 1 - x1 / width, 1 - y0 / height],
            });

            result.vertices.push({
                pos: [x1, y1, 0],
                norm: normal,
                uv: [ 1 - x1 / width, 1 - y1 / height],
            });
        }
    }

    return result;
}

const mesh : Mesh = generatePlane(512,512, 6, 6);

/** 
 * 
 * This shader calculates and outputs position and normal vector of current fragment,
 * also outputs  uv.
 * The result is piped to fragment shader
 * 
 * */ 
function vertxShader(): string {
    return `
            [[block]] struct Uniforms {     // 4x4 transform matrices
                transform : mat4x4<f32>;    // translate AND rotate
                rotate : mat4x4<f32>;       // rotate only
            };

            [[block]] struct Camera {     // 4x4 transform matrix
                matrix : mat4x4<f32>;
            };
            
            // bind model/camera buffers
            [[group(0), binding(0)]] var<uniform> modelTransform    : Uniforms;
            [[group(0), binding(1)]] var<uniform> cameraTransform   : Camera;
            
            // output struct of this vertex shader
            struct VertexOutput {
                [[builtin(position)]] Position : vec4<f32>;

                [[location(0)]] fragNorm : vec3<f32>;
                [[location(1)]] uv : vec2<f32>;
                [[location(2)]] fragPos : vec3<f32>;
            };

            // input struct according to vertex buffer stride
            struct VertexInput {
                [[location(0)]] position : vec3<f32>;
                [[location(1)]] norm : vec3<f32>;
                [[location(2)]] uv : vec2<f32>;
            };
            
            [[stage(vertex)]]
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                var transformedPosition: vec4<f32> = modelTransform.transform * vec4<f32>(input.position, 1.0);

                output.Position = cameraTransform.matrix * transformedPosition;             // transformed with model & camera projection
                output.fragNorm = (modelTransform.rotate * vec4<f32>(input.norm, 1.0)).xyz; // transformed normal vector with model
                output.uv = input.uv;                                                       // uv
                output.fragPos = transformedPosition.xyz;                                   // transformed fragment position with model

                return output;
            }
        `;
}

/**
 * This shader receives the output of the vertex shader program.
 * If texture is set, the sampler and texture is binded to this shader.
 * Determines the color of the current fragment, takes into account point light.
 * 
 */
function fragmentShader(): string {
    return  `
            [[block]] struct LightData {        // light xyz position
                lightPos : vec3<f32>;
            };

            struct FragmentInput {              // output from vertex stage shader
                [[location(0)]] fragNorm : vec3<f32>;
                [[location(1)]] uv : vec2<f32>;
                [[location(2)]] fragPos : vec3<f32>;
            };

            // bind light data buffer
            [[group(0), binding(2)]] var<uniform> lightData : LightData;

            // constants for light
            let ambientLightFactor : f32 = 0.25;     // ambient light
            [[group(0), binding(3)]] var mySampler: sampler;
            [[group(0), binding(4)]] var myTexture: texture_2d<f32>;

            [[stage(fragment)]]
            fn main(input : FragmentInput) -> [[location(0)]] vec4<f32> {
                let lightDirection: vec3<f32> = normalize(lightData.lightPos - input.fragPos);

                // lambert factor
                let lambertFactor : f32 = dot(lightDirection, input.fragNorm);

                var lightFactor: f32 = 0.0;
                lightFactor = lambertFactor;

                let lightingFactor: f32 = max(min(lightFactor, 1.0), ambientLightFactor);

                return vec4<f32>(textureSample(myTexture, mySampler, input.uv).xyz * lightingFactor, 1.0);
            }
        `;
}

export interface Parameter3D {

    x?: number;
    y?: number;
    z?: number;

    rotX?: number;
    rotY?: number;
    rotZ?: number;

    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
}


export class Plane {

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    public rotX: number = 0;
    public rotY: number = 0;
    public rotZ: number = 0;

    public scaleX: number = 1;
    public scaleY: number = 1;
    public scaleZ: number = 1;

    private matrixSize = 4 * 16; // 4x4 matrix
    private offset = 256; // transformationBindGroup offset must be 256-byte aligned
    private uniformBufferSize = this.offset;

    private transformMatrix = mat4.create() as Float32Array;
    private rotateMatrix = mat4.create() as Float32Array;

    private renderPipeline: GPURenderPipeline;
    private transformationBuffer: GPUBuffer;
    private transformationBindGroup: GPUBindGroup;
    private verticesBuffer: GPUBuffer;

    private perVertex = ( 3 + 3 + 2 );      // 3 for position, 3 for normal, 2 for uv
    private stride = this.perVertex * 4;    // stride = byte length of vertex data array 

    constructor(parameter: Parameter3D, imageBitmap: ImageBitmap) {
        this.setTransformation(parameter);
        this.renderPipeline = device.createRenderPipeline({
            vertex: {
                module: device.createShaderModule({ code: vertxShader(),}),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: this.stride, // ( 3 (pos) + 3 (norm) + 2 (uv) ) * 4 bytes
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x3',
                            },
                            {
                                // norm
                                shaderLocation: 1,
                                offset: 3 * 4,
                                format: 'float32x3',
                            },
                            {
                                // uv
                                shaderLocation: 2,
                                offset: (3 + 3) * 4,
                                format: 'float32x2',
                            },
                        ],
                    } as GPUVertexBufferLayout,
                ],
            },
            fragment: {
                module: device.createShaderModule({ code: fragmentShader(), }),
                entryPoint: 'main',
                targets: [
                    {
                        format: 'bgra8unorm' as GPUTextureFormat,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
            },
            // Enable depth testing so that the fragment closest to the camera
            // is rendered in front.
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus-stencil8',
            },
        });

        this.verticesBuffer = device.createBuffer({
            size: mesh.vertices.length * this.stride,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });

        const mapping = new Float32Array(this.verticesBuffer.getMappedRange());
        for (let i = 0; i < mesh.vertices.length; i++) {
            // (3 * 4) + (3 * 4) + (2 * 4)
            mapping.set([mesh.vertices[i].pos[0] * this.scaleX, 
                mesh.vertices[i].pos[1] * this.scaleY, 
                mesh.vertices[i].pos[2] * this.scaleZ], this.perVertex * i + 0);
            mapping.set(mesh.vertices[i].norm, this.perVertex * i + 3);
            mapping.set(mesh.vertices[i].uv, this.perVertex * i + 6);
        }
        this.verticesBuffer.unmap();

        this.transformationBuffer = device.createBuffer({
            size: this.uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const entries = [
            {
                binding: 0,
                resource: {
                    buffer: this.transformationBuffer,
                    offset: 0,
                    size: this.matrixSize * 2,
                },
            },
            {
                binding: 1,
                resource: {
                    buffer: cameraUniformBuffer,
                    offset: 0,
                    size: this.matrixSize,
                },
            },
            {
                binding: 2,
                resource: {
                    buffer: lightDataBuffer,
                    offset: 0,
                    size: lightDataSize,
                },
            },
            
        ];

        // Texture
        let texture = device.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.SAMPLED | GPUTextureUsage.COPY_DST,
        });
        device.queue.copyImageBitmapToTexture(
            { imageBitmap },
            { texture: texture },
            [imageBitmap.width, imageBitmap.height, 1]
        );
        const sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        entries.push({
            binding: 3,
            resource: sampler,
        } as any)
        entries.push({
            binding: 4,
            resource: texture.createView(),
        } as any);

        this.transformationBindGroup = device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: entries as Iterable<GPUBindGroupEntry>,
        });
    }

    public draw(passEncoder: GPURenderPassEncoder, device: GPUDevice) {
        this.updateTransformationMatrix()

        passEncoder.setPipeline(this.renderPipeline);
        device.queue.writeBuffer(
            this.transformationBuffer,
            0,
            this.transformMatrix.buffer,
            this.transformMatrix.byteOffset,
            this.transformMatrix.byteLength
        );
        device.queue.writeBuffer(
            this.transformationBuffer,
            64,
            this.rotateMatrix.buffer,
            this.rotateMatrix.byteOffset,
            this.rotateMatrix.byteLength
        );
        passEncoder.setVertexBuffer(0, this.verticesBuffer);
        passEncoder.setBindGroup(0, this.transformationBindGroup);
        passEncoder.draw(mesh.vertices.length, 1, 0, 0);
    }

    private updateTransformationMatrix() {
        // MOVE / TRANSLATE OBJECT
        const transform = mat4.create();
        const rotate = mat4.create();

        mat4.translate(transform, transform, vec3.fromValues(this.x, this.y, this.z))
        mat4.rotateX(transform, transform, this.rotX);
        mat4.rotateY(transform, transform, this.rotY);
        mat4.rotateZ(transform, transform, this.rotZ);

        mat4.rotateX(rotate, rotate, this.rotX);
        mat4.rotateY(rotate, rotate, this.rotY);
        mat4.rotateZ(rotate, rotate, this.rotZ);

        // APPLY
        mat4.copy(this.transformMatrix, transform)
        mat4.copy(this.rotateMatrix, rotate)
    }

    private setTransformation(parameter?: Parameter3D) {
        if (parameter == null) {
            return;
        }

        this.x = parameter.x ? parameter.x : 0;
        this.y = parameter.y ? parameter.y : 0;
        this.z = parameter.z ? parameter.z : 0;

        this.rotX = parameter.rotX ? parameter.rotX : 0;
        this.rotY = parameter.rotY ? parameter.rotY : 0;
        this.rotZ = parameter.rotZ ? parameter.rotZ : 0;

        this.scaleX = parameter.scaleX ? parameter.scaleX : 1;
        this.scaleY = parameter.scaleY ? parameter.scaleY : 1;
        this.scaleZ = parameter.scaleZ ? parameter.scaleZ : 1;
    }
}
