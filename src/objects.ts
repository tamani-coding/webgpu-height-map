import { device, cameraUniformBuffer } from './renderer';
import { mat4, vec3 } from 'gl-matrix';


export class Vertex  {
    pos: number[];
    norm: number[];
    uv: number[];
}

export class Mesh {
    vertices: Vertex[] = [];
}

export function generatePlane(numSegX: number, numSegY: number, width: number, height: number): Mesh {
    const result = new Mesh();

    const normal = [0, 0, 1]

    const xstep = width / numSegX;
    const ystep = height / numSegY;

    const widthHalf = width / 2;
    const heightHalf = width / 2;

    for (let x = - widthHalf; x < widthHalf; x += xstep) {
        for (let y = - heightHalf; y < heightHalf; y += ystep) {

            const x0 = x;
            const y0 = y;
            const x1 = x0 + xstep;
            const y1 = y0 + ystep;
            
            result.vertices.push({
                pos: [x0, y0, 0],
                norm: normal,
                uv: [1 - ( x0 + widthHalf) / width, (y0 + heightHalf)/ height],
            });

            result.vertices.push({
                pos: [x1, y0, 0],
                norm: normal,
                uv: [ 1 - (x1 + widthHalf)/ width, (y0 + heightHalf)/ height],
            });

            result.vertices.push({
                pos: [x0, y1, 0],
                norm: normal,
                uv: [1 - (x0 + widthHalf)/ width, (y1 + heightHalf)/ height],
            });

            result.vertices.push({
                pos: [x0, y1, 0],
                norm: normal,
                uv: [1 - (x0 + widthHalf)/ width, (y1 + heightHalf)/ height],
            });

            result.vertices.push({
                pos: [x1, y0, 0],
                norm: normal,
                uv: [ 1 - (x1 + widthHalf)/ width, (y0 + heightHalf)/ height],
            });

            result.vertices.push({
                pos: [x1, y1, 0],
                norm: normal,
                uv: [ 1 - (x1 + widthHalf)/ width, (y1 + heightHalf)/ height],
            });
        }
    }

    return result;
}

/** 
 * 
 * This shader calculates and outputs position and normal vector of current fragment,
 * also outputs  uv.
 * The result is piped to fragment shader
 * 
 * */ 
function vertxShader(): string {
    return `
            struct Uniforms {     // 4x4 transform matrices
                transform : mat4x4<f32>;    // translate AND rotate
                rotate : mat4x4<f32>;       // rotate only
            };

            struct Camera {     // 4x4 transform matrix
                matrix : mat4x4<f32>;
            };
            
            // bind model/camera buffers
            @group(0) @binding(0) var<uniform> modelTransform    : Uniforms;
            @group(0) @binding(1) var<uniform> cameraTransform   : Camera;
            @group(0) @binding(2) var heightTexture: texture_2d<f32>;

            // output struct of this vertex shader
            struct VertexOutput {
                @builtin(position) Position : vec4<f32>;

                @location(0) heightFactor: f32;
            };

            // input struct according to vertex buffer stride
            struct VertexInput {
                @location(0) position : vec3<f32>;
                @location(1) norm : vec3<f32>;
                @location(2) uv : vec2<f32>;
            };
            
            @stage(vertex)
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                var inputPos: vec3<f32> = input.position;
                var d : vec2<i32> = textureDimensions(heightTexture);
                var heightPixel: vec4<f32> = textureLoad(heightTexture, vec2<i32>( i32(input.uv.x * f32(d.x)), i32(input.uv.y * f32(d.y)) ), 0);
                var height: f32 = (heightPixel.x + heightPixel.y + heightPixel.z) / 3.0;
                inputPos = inputPos + input.norm * height * 10.0;

                var transformedPosition: vec4<f32> = modelTransform.transform * vec4<f32>(inputPos, 1.0);

                output.Position = cameraTransform.matrix * transformedPosition;             // transformed with model & camera projection
                output.heightFactor = height;
                return output;
            }
        `;
}


function fragmentShader(): string {
    return  `
            struct FragmentInput {
                @location(0) heightFactor: f32;
            };

            @stage(fragment)
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                return vec4<f32>( vec3<f32>(1.0 * input.heightFactor, 0.2, 0.2).xyz, 1.0);
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

    width?: number;
    height?: number;

    numSegX?:number;
    numSegY?:number;
}


export class Plane {

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    public rotX: number = 0;
    public rotY: number = 0;
    public rotZ: number = 0;

    public width: number = 1;
    public height: number = 1;

    public numSegX: number = 1;
    public numSegY: number = 1;

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

    private mesh : Mesh;

    constructor(parameter: Parameter3D, heightBitmap: ImageBitmap) {
        this.setTransformation(parameter);
        this.mesh = generatePlane(this.numSegX, this.numSegY, this.width, this.height);

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
            size: this.mesh.vertices.length * this.stride,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });

        const mapping = new Float32Array(this.verticesBuffer.getMappedRange());
        for (let i = 0; i < this.mesh.vertices.length; i++) {
            // (3 * 4) + (3 * 4) + (2 * 4)
            mapping.set([this.mesh.vertices[i].pos[0], 
                this.mesh.vertices[i].pos[1], 
                this.mesh.vertices[i].pos[2]], this.perVertex * i + 0);
            mapping.set(this.mesh.vertices[i].norm, this.perVertex * i + 3);
            mapping.set(this.mesh.vertices[i].uv, this.perVertex * i + 6);
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
            
        ];

        // Texture
        let height = device.createTexture({
            size: [heightBitmap.width, heightBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture(
            { source: heightBitmap },
            { texture: height },
            [heightBitmap.width, heightBitmap.height, 1]
        );

        entries.push({
            binding: 2,
            resource: height.createView(),
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
        passEncoder.draw(this.mesh.vertices.length, 1, 0, 0);
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

        this.width = parameter.width ? parameter.width : 1;
        this.height = parameter.height ? parameter.height : 1;
    
        this.numSegX = parameter.numSegX ? parameter.numSegX : 1;
        this.numSegY = parameter.numSegY ? parameter.numSegY : 1;
    }
}
