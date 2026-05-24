const SITES = {
    // TRIAD DATACENTERS
    ewa: { x: 170, y: 150, type: 'datacenter', label: "EWA_TUKWILA" },
    phx: { x: 210, y: 220, type: 'datacenter', label: "PHX_PHOENIX" },
    clt: { x: 300, y: 200, type: 'datacenter', label: "CLT_CHARLOTTE" },
    // GLOBAL CLIENTS
    sea: { x: 160, y: 140, type: 'client', label: "SEA_PUGET" },
    socal: { x: 180, y: 230, type: 'client', label: "SOCAL_HUB" },
    stl: { x: 260, y: 190, type: 'client', label: "STL_BERKELEY" },
    rid: { x: 320, y: 170, type: 'client', label: "RID_PHILLY" },
    chs: { x: 310, y: 220, type: 'client', label: "CHS_CHARLESTON" },
    dab: { x: 310, y: 240, type: 'client', label: "DAB_DAYTONA" },
    sjc: { x: 380, y: 400, type: 'client', label: "SJC_BRAZIL" },
    pol: { x: 550, y: 140, type: 'client', label: "POL_WARSAW" },
    blr: { x: 750, y: 250, type: 'client', label: "BLR_INDIA" }
};

const SERVICES = [
    { id: "NX_SIEMENS", state: "ok", triad: ["ewa", "phx", "clt"], down: [] },
    { id: "MATLAB_R2", state: "warn", triad: ["ewa", "phx", "clt"], down: ["ewa"] }, // EWA is down, testing failover
    { id: "ANSYS_HPC", state: "crit", triad: ["ewa", "phx", "clt"], down: ["phx", "clt"] } // Quorum lost
];

let currentView = null;

function init() {
    renderSidebar();
    // Default to first service
    loadTopology(SERVICES[0].id);
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
    let quorumText = upNodes.length >= 2 ? "QUORUM MET (NOMINAL)" : "QUORUM LOST (SERVICE HALTED)";
    if (upNodes.length === 2) quorumText = "QUORUM DEGRADED (1 FAILURE FROM HALT)";
    document.getElementById('view-subtitle').innerText = `TRIAD STATUS: ${quorumText}`;
    document.getElementById('view-subtitle').style.color = upNodes.length >= 2 ? (upNodes.length === 3 ? "var(--cyan)" : "var(--amber)") : "var(--red)";

    drawMap(svc, upNodes);
}

function drawMap(svc, upNodes) {
    const gNodes = document.getElementById('layer-nodes');
    const gQuorum = document.getElementById('layer-quorum-links');
    const gClients = document.getElementById('layer-client-links');
    
    gNodes.innerHTML = ''; gQuorum.innerHTML = ''; gClients.innerHTML = '';

    // 1. Draw Quorum Triad Connections
    if (upNodes.includes("ewa") && upNodes.includes("phx")) drawLink(SITES.ewa, SITES.phx, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));
    if (upNodes.includes("phx") && upNodes.includes("clt")) drawLink(SITES.phx, SITES.clt, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));
    if (upNodes.includes("clt") && upNodes.includes("ewa")) drawLink(SITES.clt, SITES.ewa, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));

    // 2. Draw Client Routing & Latency Pulses
    Object.keys(SITES).forEach(key => {
        const site = SITES[key];
        if (site.type === 'client') {
            if (upNodes.length > 0) {
                // Find closest active triad member (simulating geographic routing)
                let closest = upNodes[0];
                let minVisDist = 9999;
                upNodes.forEach(t => {
                    const d = Math.hypot(site.x - SITES[t].x, site.y - SITES[t].y);
                    if (d < minVisDist) { minVisDist = d; closest = t; }
                });

                // Calculate latency animation speed based on distance
                // Local routing (e.g., SoCal to PHX) = fast. Overseas (BLR to CLT) = slow.
                const latencyDur = Math.max(0.5, minVisDist / 100).toFixed(1); 
                const pathId = `path-${key}`;
                
                // Draw static line
                drawLink(site, SITES[closest], gClients, 'client', pathId);
                
                // Animate packet
                const packetColor = upNodes.length < 2 ? 'var(--red)' : (latencyDur > 1.5 ? 'var(--amber)' : 'var(--cyan)');
                if (upNodes.length >= 2) { // Only animate if quorum is up
                    drawPulse(pathId, latencyDur, packetColor, gClients);
                }
            }
        }
        
        // 3. Draw Nodes (Hex for Datacenter, Circle for Client)
        const isFault = svc.down.includes(key);
        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', `node ${isFault ? 'fault' : ''}`);
        
        if (site.type === 'datacenter') {
            const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            hex.setAttribute('points', getHexPoints(site.x, site.y, 15));
            hex.setAttribute('class', 'node-datacenter');
            nodeG.appendChild(hex);
        } else {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', site.x); circle.setAttribute('cy', site.y);
            circle.setAttribute('r', '5');
            circle.setAttribute('class', 'node-client');
            nodeG.appendChild(circle);
        }

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', site.x + 10); lbl.setAttribute('y', site.y - 10);
        lbl.setAttribute('class', 'node-label');
        lbl.textContent = site.label;
        nodeG.appendChild(lbl);

        gNodes.appendChild(nodeG);
    });
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

function drawLink(n1, n2, group, className, id = null) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const cx = (n1.x + n2.x) / 2;
    const cy = Math.min(n1.y, n2.y) - 40;
    path.setAttribute('d', `M ${n1.x} ${n1.y} Q ${cx} ${cy} ${n2.x} ${n2.y}`);
    path.setAttribute('class', `link ${className}`);
    if (id) path.setAttribute('id', id);
    group.appendChild(path);
}

function drawPulse(pathId, duration, color, group) {
    const packet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    packet.setAttribute('r', '3'); packet.setAttribute('fill', color);
    packet.style.filter = `drop-shadow(0 0 5px ${color})`;
    
    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    animate.setAttribute('dur', `${duration}s`);
    animate.setAttribute('repeatCount', 'indefinite');
    
    const mPath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
    mPath.setAttribute('href', `#${pathId}`);
    
    animate.appendChild(mPath); packet.appendChild(animate); group.appendChild(packet);
}

window.onload = init;
