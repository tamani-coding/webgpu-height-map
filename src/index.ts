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
camera.y = 10
const scene = new Scene();

const renderer = new WebGpuRenderer();
renderer.init(outputCanvas).then((success) => {
    if (!success) return;

    // textured planes
    const texturedPlane: Plane[] = [];

    const texture1 = document.createElement('img');
    texture1.src = './crocodile_gena.png';
    texture1.decode().then( () => {
        createImageBitmap(texture1).then( (imageBitmap: ImageBitmap) => {
            const plane = new Plane({ x: -8 }, imageBitmap);
            texturedPlane.push(plane);
            scene.add(plane);
        });
    });

    const texture2 = document.createElement('img');
    texture2.src = './terranigma.png';
    texture2.decode().then( () => {
        createImageBitmap(texture2).then( (imageBitmap: ImageBitmap) => {
            const plane = new Plane({  }, imageBitmap);
            texturedPlane.push(plane);
            scene.add(plane);
        });
    });

    const texture3 = document.createElement('img');
    texture3.src = './deno.png';
    texture3.decode().then( () => {
        createImageBitmap(texture3).then( (imageBitmap: ImageBitmap) => {
            const plane = new Plane({ x: 8 }, imageBitmap);
            texturedPlane.push(plane);
            scene.add(plane);
        });
    });


    const doFrame = () => {
        // ANIMATE
        const now = Date.now() / 1000;

        scene.pointLightPosition[0] = Math.cos(now) * 10;
        scene.pointLightPosition[1] = 2;
        scene.pointLightPosition[2] = 2;

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