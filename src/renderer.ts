import { Scene } from './scene';
import { Camera } from './camera';

export var device: GPUDevice;
export var cameraUniformBuffer: GPUBuffer;

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    private initSuccess: boolean = false;
    private renderPassDescriptor: GPURenderPassDescriptor;
    private context: GPUCanvasContext;
    private presentationFormat: GPUTextureFormat;
    private presentationSize: number[];

    private matrixSize = 4 * 16; // 4x4 matrix

    constructor() { }

    public async init(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!canvas) {
            console.log('missing canvas!')
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        device = await adapter.requestDevice();

        if (!device) {
            console.log('found no gpu device!')
            return false;
        }

        this.context = canvas.getContext('webgpu');

        this.presentationFormat = this.context.getPreferredFormat(adapter);
        this.presentationSize = [
            canvas.clientWidth * devicePixelRatio,
            canvas.clientHeight  * devicePixelRatio,
        ];

        this.context.configure({
            device,
            format: this.presentationFormat,
            size: this.presentationSize,
        });

        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    // attachment is acquired and set in render loop.
                    view: undefined,
                    loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                } as GPURenderPassColorAttachment,
            ],
            depthStencilAttachment: {
                view: this.depthTextureView(canvas),

                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            } as GPURenderPassDepthStencilAttachment,
        };

        cameraUniformBuffer = device.createBuffer({
            size: this.matrixSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.updateRenderPassDescriptor(canvas);
    }

    public frame(camera: Camera, scene: Scene) {
        if (!this.initSuccess) {
            return;
        }

        // CAMERA BUFFER
        const cameraViewProjectionMatrix = camera.getCameraViewProjMatrix() as Float32Array;
        device.queue.writeBuffer(
            cameraUniformBuffer,
            0,
            cameraViewProjectionMatrix.buffer,
            cameraViewProjectionMatrix.byteOffset,
            cameraViewProjectionMatrix.byteLength
        );

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment])[0].view = this.context
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of scene.getObjects()) {
            object.draw(passEncoder, device)
        }

        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
    }

    private depthTextureView(canvas: HTMLCanvasElement) {
        return device.createTexture({
            size: this.presentationSize,
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }).createView();
    }

    private updateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        (this.renderPassDescriptor.depthStencilAttachment as GPURenderPassDepthStencilAttachment).view = this.depthTextureView(canvas);
    }
}