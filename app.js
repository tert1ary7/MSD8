const SITES = {
    ewa: { x: 170, y: 150, type: 'datacenter', label: "EWA_TUKWILA" },
    phx: { x: 210, y: 220, type: 'datacenter', label: "PHX_PHOENIX" },
    clt: { x: 300, y: 200, type: 'datacenter', label: "CLT_CHARLOTTE" },
    sea: { x: 160, y: 140, type: 'client', label: "SEA_PUGET" },
    socal: { x: 180, y: 230, type: 'client', label: "SOCAL_HUB" },
    stl: { x: 260, y: 190, type: 'client', label: "STL_BERKELEY" },
    rid: { x: 320, y: 170, type: 'client', label: "RID_PHILLY" },
    sjc: { x: 380, y: 400, type: 'client', label: "SJC_BRAZIL" },
    blr: { x: 750, y: 250, type: 'client', label: "BLR_INDIA" },
    pol: { x: 550, y: 140, type: 'client', label: "POL_WARSAW" }
};

const SERVICES = [
    { id: "NX_SIEMENS", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "MATLAB_R2", state: "warn", triad: ["ewa", "phx", "clt"], down: ["ewa"] },
    { id: "ANSYS_HPC", state: "crit", triad: ["ewa", "phx", "clt"], down: ["phx", "clt"] }
];

let currentView = null;
let streamInterval = null;
let clientPaths = []; // Store paths for dot-stream orchestration

function init() {
    renderSidebar();
    loadTopology(SERVICES[0].id);
    startStreamOrchestrator();
}

function renderSidebar() {
    const grid = document.getElementById('service-grid');
    grid.innerHTML = SERVICES.map(s => `
        <div class="service-hex ${currentView === s.id ? 'active-view' : ''}" onclick="loadTopology('${s.id}')">
            <span class="lbl">${s.id.split('_')[0]}</span>
            <span class="stat ${s.state === 'ok' ? 'text-ok' : 'text-warn'}">${s.state.toUpperCase()}</span>
        </div>
    `).join('');
}

function loadTopology(serviceId) {
    currentView = serviceId;
    renderSidebar();
    
    const svc = SERVICES.find(s => s.id === serviceId);
    document.getElementById('view-title').innerText = `TOPOLOGY: ${svc.id}`;
    
    const upNodes = svc.triad.filter(n => !svc.down.includes(n));
    let quorumText = upNodes.length >= 2 ? "QUORUM MET (NOMINAL)" : "QUORUM LOST (HALTED)";
    if (upNodes.length === 2) quorumText = "QUORUM DEGRADED (1 FAULT TILL HALT)";
    
    const corePanel = document.getElementById('core-panel');
    const subtitle = document.getElementById('view-subtitle');
    subtitle.innerText = `TRIAD STATUS: ${quorumText}`;
    
    if (upNodes.length >= 2) {
        subtitle.style.color = upNodes.length === 3 ? "var(--cyan)" : "var(--amber)";
        corePanel.style.backgroundColor = upNodes.length === 3 ? "transparent" : "rgba(245, 158, 11, 0.05)";
    } else {
        subtitle.style.color = "var(--red)";
        corePanel.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
    }

    drawMap(svc, upNodes);
}

function drawMap(svc, upNodes) {
    const gNodes = document.getElementById('layer-nodes');
    const gQuorum = document.getElementById('layer-quorum-links');
    const gClients = document.getElementById('layer-client-links');
    const gPlasma = document.getElementById('layer-plasma');
    
    gNodes.innerHTML = ''; gQuorum.innerHTML = ''; gClients.innerHTML = ''; gPlasma.innerHTML = '';
    clientPaths = [];

    // 1. Quorum Conduits & Plasma Shimmer
    const drawQuorum = (n1, n2, id) => {
        drawLink(SITES[n1], SITES[n2], gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''), id);
        // Add Plasma Shimmer if both nodes are up
        if (upNodes.includes(n1) && upNodes.includes(n2)) {
            const speed = Math.hypot(SITES[n1].x - SITES[n2].x, SITES[n1].y - SITES[n2].y) / 50; // Dynamic speed based on length
            drawPlasmaHighlight(id, Math.max(3, speed), upNodes.length < 3 ? 'var(--amber)' : 'var(--cyan)', gPlasma);
        }
    };

    if (upNodes.includes("ewa") || svc.down.includes("ewa")) drawQuorum("ewa", "phx", "q-ewa-phx");
    if (upNodes.includes("phx") || svc.down.includes("phx")) drawQuorum("phx", "clt", "q-phx-clt");
    if (upNodes.includes("clt") || svc.down.includes("clt")) drawQuorum("clt", "ewa", "q-clt-ewa");

    // 2. Client Routing
    Object.keys(SITES).forEach(key => {
        const site = SITES[key];
        const isFault = svc.down.includes(key);

        if (site.type === 'client' && upNodes.length > 0) {
            let closest = upNodes[0];
            let minDist = 9999;
            upNodes.forEach(t => {
                const d = Math.hypot(site.x - SITES[t].x, site.y - SITES[t].y);
                if (d < minDist) { minDist = d; closest = t; }
            });

            const pathId = `path-${key}`;
            const pathEl = drawLink(site, SITES[closest], gClients, 'client', pathId);
            clientPaths.push(pathEl);
        }
        
        // 3. Render Nodes
        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', `node ${isFault ? 'fault' : ''}`);
        
        if (site.type === 'datacenter') {
            const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hex.setAttribute('points', getHexPoints(site.x, site.y, 14));
            hex.setAttribute('class', 'node-datacenter');
            nodeG.appendChild(hex);
        } else {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', site.x); circle.setAttribute('cy', site.y);
            circle.setAttribute('r', '4');
            circle.setAttribute('class', 'node-client');
            nodeG.appendChild(circle);
        }

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', site.x + 8); lbl.setAttribute('y', site.y - 8);
        lbl.setAttribute('class', 'node-label');
        lbl.textContent = site.label;
        nodeG.appendChild(lbl);

        gNodes.appendChild(nodeG);
    });
}

// Draw the static bezier curve
function drawLink(n1, n2, group, className, id = null) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const cx = (n1.x + n2.x) / 2;
    const cy = Math.min(n1.y, n2.y) - 40;
    path.setAttribute('d', `M ${n1.x} ${n1.y} Q ${cx} ${cy} ${n2.x} ${n2.y}`);
    path.setAttribute('class', `link ${className}`);
    if (id) path.setAttribute('id', id);
    group.appendChild(path);
    return path;
}

// The "Traveling Conduit Highlight" (Plasma Shimmer)
function drawPlasmaHighlight(pathId, duration, color, group) {
    // Ellipse acts as the soft, elongated gradient
    const plasma = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plasma.setAttribute('rx', '15'); 
    plasma.setAttribute('ry', '2');
    plasma.setAttribute('fill', color);
    plasma.setAttribute('opacity', '0.3'); // Strict max 30% opacity constraint
    plasma.setAttribute('filter', 'url(#conduit-blur)');
    
    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    animate.setAttribute('dur', `${duration}s`);
    animate.setAttribute('repeatCount', 'indefinite');
    animate.setAttribute('rotate', 'auto'); // Allows the ellipse to follow the curve orientation
    
    const mPath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
    mPath.setAttribute('href', `#${pathId}`);
    
    animate.appendChild(mPath);
    plasma.appendChild(animate);
    group.appendChild(plasma);
}

// Orchestrate the "Dot-Stream" (Max 2 simultaneous logically active streams)
function startStreamOrchestrator() {
    if (streamInterval) clearInterval(streamInterval);
    
    streamInterval = setInterval(() => {
        // Clear all streams
        clientPaths.forEach(p => {
            p.classList.remove('stream-active');
            p.style.animation = 'none';
        });

        if (clientPaths.length === 0) return;

        // Pick 1 or 2 random paths to "stream" traffic
        const activeCount = Math.floor(Math.random() * 2) + 1; // 1 or 2
        for(let i=0; i<activeCount; i++) {
            const rndPath = clientPaths[Math.floor(Math.random() * clientPaths.length)];
            rndPath.classList.add('stream-active');
            
            // Apply inline Web Animations API for smooth sliding of the dashed line
            rndPath.animate([
                { strokeDashoffset: '16' },
                { strokeDashoffset: '0' }
            ], {
                duration: 1000,
                iterations: Infinity,
                easing: 'linear'
            });
        }
    }, 4000); // Rotate active streams every 4 seconds
}

// Helpers
function getHexPoints(x, y, r) {
    let pts = [];
    for (let i = 0; i < 6; i++) {
        let a = (Math.PI / 180) * (60 * i - 30);
        pts.push(`${x + r * Math.cos(a)},${y + r * Math.sin(a)}`);
    }
    return pts.join(' ');
}

window.onload = init;
