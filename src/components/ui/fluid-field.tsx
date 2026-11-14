import { useEffect, useRef, type CSSProperties } from "react";

/**
 * Animated simplex-noise fluid background (native WebGL, no external scripts).
 * Follows the app theme: deep ink with blue/violet beams in dark mode, soft
 * lavender ground with gentle violet light in light mode.
 */
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;
const FRAG = `precision mediump float;
uniform float u_time; uniform vec2 u_res; uniform float u_light;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
return 130.0*dot(m,g);}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res.xy; uv.x*=u_res.x/u_res.y;
  vec2 st=uv*0.7; st+=vec2(snoise(st+u_time*0.05),snoise(st-u_time*0.05))*0.3;
  float beam=smoothstep(0.1,0.8,snoise(vec2(st.x+st.y*1.5-u_time*0.15,u_time*0.02)));
  float mixv=snoise(uv*1.5+u_time*0.1)*0.5+0.5;
  vec3 darkCol=vec3(0.012,0.012,0.02)+mix(vec3(0.15,0.25,0.85),vec3(0.4,0.2,0.9),mixv)*beam*0.7;
  vec3 lightBase=vec3(0.955,0.945,0.99);
  vec3 lightCol=mix(lightBase, mix(vec3(0.72,0.76,1.0),vec3(0.82,0.72,1.0),mixv), beam*0.55);
  gl_FragColor=vec4(mix(darkCol,lightCol,u_light),1.0);
}`;

export function FluidFieldBackground({ className, style }: { className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false });
    if (!canvas || !gl) return;
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uLight = gl.getUniformLocation(prog, "u_light");

    const resize = () => {
      // Half resolution: the field is soft, and this keeps it cheap.
      const s = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      canvas.width = Math.max(1, Math.floor(window.innerWidth * s));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * s));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize(); window.addEventListener("resize", resize);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    const draw = () => {
      const light = document.documentElement.classList.contains("dark") ? 0 : 1;
      gl.uniform1f(uTime, reduce ? 8 : (performance.now() - start) / 1000);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uLight, light);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    draw();
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) draw(); };
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => { if (reduce) draw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis); mo.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none", ...style }} />;
}

export default FluidFieldBackground;
