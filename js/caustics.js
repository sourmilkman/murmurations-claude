/* Murmurations — GPU water caustics (animated Voronoi-edge light network, perspective-projected onto
   the seabed plane and the underside of the surface). Composited with mix-blend-mode: screen. */
(function () {
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision mediump float;
uniform vec2 uRes;uniform float uT,uBed,uSurf,uBedI,uSurfI,uBedX0,uBedX1,uScale;uniform vec3 uCol;
vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float vor(vec2 p,float t){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=h2(i+g);
  o=.5+.42*sin(t*.85+6.2831*o);vec2 r=g+o-f;float d=dot(r,r);
  if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}}
 return sqrt(d2)-sqrt(d1);}
float caustic(vec2 p,float t){
 vec2 w=vec2(sin(p.y*1.3+t*.7),cos(p.x*1.1-t*.6))*.2;
 float e1=vor(p+w,t),e2=vor(p*1.37+vec2(3.1,1.7)-w,t*1.13+2.);
 float c1=exp(-e1*8.),c2=exp(-e2*8.);
 return c1*.6+c2*.4+c1*c2*1.8;}
void main(){
 vec2 fc=gl_FragCoord.xy;float y=uRes.y-fc.y;vec3 col=vec3(0.);
 if(y>uBed){float dz=(y-uBed)/uRes.y;float z=.06/max(dz,.004);
  vec2 p=vec2((fc.x-uRes.x*.5)/uRes.y*z,z)*uScale;
  float fade=smoothstep(0.,.14,dz)*smoothstep(uBedX0,uBedX1,fc.x);
  col+=uCol*caustic(p,uT)*uBedI*fade;}
 if(y<uSurf){float dz=(uSurf-y)/uRes.y;float z=.05/max(dz,.004);
  vec2 p=vec2((fc.x-uRes.x*.5)/uRes.y*z,z)*uScale*.7+vec2(0.,uT*.08);
  float fade=smoothstep(0.,.18,dz);
  col+=uCol*caustic(p,uT*1.15)*uSurfI*fade;}
 gl_FragColor=vec4(col,1.);}`;
  let cv = null, gl = null, prog = null, U = {}, ok = false, on = false, meta = null;
  function setup() {
    if (cv) return ok;
    cv = document.createElement('canvas');
    cv.id = 'caustics';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;mix-blend-mode:screen;opacity:0;transition:opacity 1.2s ease;pointer-events:none';
    const c = document.getElementById('c');
    c.parentNode.insertBefore(cv, c);
    gl = cv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return (ok = false);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (ok = false);
    gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uT', 'uBed', 'uSurf', 'uBedI', 'uSurfI', 'uBedX0', 'uBedX1', 'uScale', 'uCol'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    return (ok = true);
  }
  M.caustics = {
    enable(m) { meta = m; if (!setup()) return; on = true; cv.style.opacity = '1'; },
    disable() { on = false; if (cv) cv.style.opacity = '0'; },
    render(t, env) {
      if (!on || !ok || !meta) return;
      const q = 0.7 * Math.min(env.dpr, 1.25) * Math.max(0.6, env.quality);
      const w = Math.max(2, Math.round(env.W * q)), h = Math.max(2, Math.round(env.H * q));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h);
      const c = meta.caustics;
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uBed, env.map(0, c.bed)[1] * q); gl.uniform1f(U.uSurf, env.map(0, c.surf)[1] * q);
      gl.uniform1f(U.uBedI, c.bedI); gl.uniform1f(U.uSurfI, c.surfI);
      gl.uniform1f(U.uBedX0, env.map(c.bedX[0], 0)[0] * q); gl.uniform1f(U.uBedX1, env.map(c.bedX[1], 0)[0] * q);
      gl.uniform1f(U.uScale, c.scale); gl.uniform3f(U.uCol, c.col[0], c.col[1], c.col[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
})();
