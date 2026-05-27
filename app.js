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
};

const FLOW_ANIMATION_CONFIG = {
    shimmerLength: 60,           // Length of the gradient shimmer in pixels
    shimmerSpeed: 2.0,           // cm/s equivalent speed (scaled to canvas)
    shimmerOpacity: 0.25,        // Max opacity of shimmer (20-30%)
    baseTraversalTime: 3.0,      // Reference time for a 300px path
    referenceDistance: 300       // Reference distance in pixels
};

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
    const gFlows = document.getElementById('layer-flows') || createFlowLayer();
    
    gNodes.innerHTML = ''; gQuorum.innerHTML = ''; gClients.innerHTML = ''; gFlows.innerHTML = '';

    // 1. Draw Quorum Triad Connections
    if (upNodes.includes("ewa") && upNodes.includes("phx")) drawLink(SITES.ewa, SITES.phx, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));
    if (upNodes.includes("phx") && upNodes.includes("clt")) drawLink(SITES.phx, SITES.clt, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));
    if (upNodes.includes("clt") && upNodes.includes("ewa")) drawLink(SITES.clt, SITES.ewa, gQuorum, 'quorum ' + (upNodes.length<3?'degraded':''));

    // 2. Draw Client Routing & Flow Shimmer
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

                const pathId = `path-${key}`;
                
                // Draw static line
                drawLink(site, SITES[closest], gClients, 'client', pathId);
                
                // Draw flow shimmer along the line
                if (upNodes.length >= 2) { // Only animate if quorum is up
                    const shimmerColor = minVisDist > 350 ? 'var(--amber)' : 'var(--cyan)';
                    drawFlowShimmer(pathId, minVisDist, shimmerColor, gFlows);
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
function createFlowLayer() {
    const svg = document.querySelector('svg');
    let gFlows = document.getElementById('layer-flows');
    if (!gFlows) {
        gFlows = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gFlows.setAttribute('id', 'layer-flows');
        svg.appendChild(gFlows);
    }
    return gFlows;
}

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

function drawFlowShimmer(pathId, distance, color, group) {
    // Calculate animation duration based on distance
    // Proportional scaling: maintain crawl-like speed
    const animDuration = (distance / FLOW_ANIMATION_CONFIG.referenceDistance) * FLOW_ANIMATION_CONFIG.baseTraversalTime;
    
    // Create SVG filter with a gradient shimmer effect
    const defs = document.querySelector('svg defs') || (() => {
        const newDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        document.querySelector('svg').insertBefore(newDefs, document.querySelector('svg').firstChild);
        return newDefs;
    })();
    
    const filterId = `shimmer-filter-${pathId}`;
    if (!document.getElementById(filterId)) {
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);
        filter.setAttribute('x', '-50%');
        filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%');
        filter.setAttribute('height', '200%');
        
        // Radial gradient for soft shimmer
        const radialGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        radialGrad.setAttribute('id', `grad-${filterId}`);
        radialGrad.innerHTML = `
            <stop offset="0%" style="stop-color:${color};stop-opacity:${FLOW_ANIMATION_CONFIG.shimmerOpacity}" />
            <stop offset="50%" style="stop-color:${color};stop-opacity:0.1" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0" />
        `;
        defs.appendChild(radialGrad);
    }
    
    // Create the shimmer line (a stroked path that animates along the target path)
    const shimmerPath = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    shimmerPath.setAttribute('href', `#${pathId}`);
    shimmerPath.setAttribute('class', 'flow-shimmer');
    shimmerPath.setAttribute('stroke', color);
    shimmerPath.setAttribute('stroke-width', `${FLOW_ANIMATION_CONFIG.shimmerLength}`);
    shimmerPath.setAttribute('stroke-opacity', `${FLOW_ANIMATION_CONFIG.shimmerOpacity}`);
    shimmerPath.setAttribute('fill', 'none');
    shimmerPath.setAttribute('stroke-linecap', 'round');
    
    // Animate the stroke-dasharray to create a traveling shimmer
    const animateStrokeDash = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    animateStrokeDash.setAttribute('attributeName', 'stroke-dashoffset');
    animateStrokeDash.setAttribute('from', `0`);
    animateStrokeDash.setAttribute('to', `${distance}`);
    animateStrokeDash.setAttribute('dur', `${animDuration}s`);
    animateStrokeDash.setAttribute('repeatCount', 'indefinite');
    animateStrokeDash.setAttribute('keyTimes', '0;1');
    animateStrokeDash.setAttribute('keySplines', '0.42 0 0.58 1'); // Ease-in-out
    
    shimmerPath.appendChild(animateStrokeDash);
    
    // Apply subtle opacity variation to avoid static appearance
    const animateOpacity = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    animateOpacity.setAttribute('attributeName', 'stroke-opacity');
    animateOpacity.setAttribute('from', `${FLOW_ANIMATION_CONFIG.shimmerOpacity * 0.7}`);
    animateOpacity.setAttribute('to', `${FLOW_ANIMATION_CONFIG.shimmerOpacity}`);
    animateOpacity.setAttribute('dur', '2s');
    animateOpacity.setAttribute('repeatCount', 'indefinite');
    animateOpacity.setAttribute('keyTimes', '0;0.5;1');
    animateOpacity.setAttribute('values', `${FLOW_ANIMATION_CONFIG.shimmerOpacity * 0.7};${FLOW_ANIMATION_CONFIG.shimmerOpacity};${FLOW_ANIMATION_CONFIG.shimmerOpacity * 0.7}`);
    
    shimmerPath.appendChild(animateOpacity);
    
    group.appendChild(shimmerPath);
}

window.onload = init;
