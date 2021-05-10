import { Plane } from './objects';
import { Scene } from './scene';
import { Camera } from './camera';
import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

const camera = new Camera(outputCanvas.width / outputCanvas.height);
camera.z = 10
camera.y = 5
const scene = new Scene();

const renderer = new WebGpuRenderer();
renderer.init(outputCanvas).then(async (success) => {
    if (!success) return;

    const width = 80;
    const height = 80;
    const posy = 5;

    const heigtmap = document.createElement('img');
    heigtmap.src = './heightmap.png';
    await heigtmap.decode();
    const heightBitmap = await createImageBitmap(heigtmap)
    
    const texture = document.createElement('img');
    texture.src = './deno.png';
    await texture.decode();
    const textureBitmap = await createImageBitmap(texture);

    const plane1 = new Plane({ y: -posy, width: width, height: height, rotX: -Math.PI / 2,
        numSegX: 512, numSegY: 512 }, textureBitmap, heightBitmap);
    scene.add(plane1);

    const doFrame = () => {
        // ANIMATE
        const now = Date.now() / 1000;

        scene.pointLightPosition[0] = Math.cos(now) * 10;
        scene.pointLightPosition[1] = 10;
        scene.pointLightPosition[2] = 0;

        // RENDER
        renderer.frame(camera, scene);
        requestAnimationFrame(doFrame);
    };
    requestAnimationFrame(doFrame);
});

window.onresize = () => {
    outputCanvas.width = window.innerWidth;
    outputCanvas.height = window.innerHeight;
    camera.aspect = outputCanvas.width / outputCanvas.height;
    renderer.update(outputCanvas);
}

// MOUSE CONTROLS

// ZOOM
outputCanvas.onwheel = (event: WheelEvent) => {
    const delta = event.deltaY / 100;
    // no negative camera.z
    if(camera.z > -delta) {
        camera.z += event.deltaY / 100
    }
}

// MOUSE DRAG
var mouseDown = false;
outputCanvas.onmousedown = (event: MouseEvent) => {
    mouseDown = true;

    lastMouseX = event.pageX;
    lastMouseY = event.pageY;
}
outputCanvas.onmouseup = (event: MouseEvent) => {
    mouseDown = false;
}
var lastMouseX=-1; 
var lastMouseY=-1;
outputCanvas.onmousemove = (event: MouseEvent) => {
    if (!mouseDown) {
        return;
    }

    var mousex = event.pageX;
    var mousey = event.pageY;

    if (lastMouseX > 0 && lastMouseY > 0) {
        const roty = mousex - lastMouseX;
        const rotx = mousey - lastMouseY;

        camera.rotY += roty / 100;
        camera.rotX += rotx / 100;
    }

    lastMouseX = mousex;
    lastMouseY = mousey;
}