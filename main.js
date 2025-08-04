document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("matrix3d");
  const feedbackEl = document.getElementById("feedback");
  const playerScoreEl = document.getElementById("playerScore");
  const computerScoreEl = document.getElementById("computerScore");
  const startGameButton = document.getElementById("startGameButton");
  const howToPlayButton = document.getElementById("howToPlayButton");
  const rulesModal = document.getElementById("rulesModal");
  const restartButton = document.querySelector("#hud button");

  const COLORS = {
    DEFAULT_SPHERE: 0x1A2525,  // Dark teal-gray (unclaimed spheres, subtle and moody)
    HOVER: 0x00FF55,           // Bright CRT green (hover highlight, glowing effect)
    PLAYER: 0xFFAA00,          // Amber-orange (player spheres, warm and distinct)
    COMPUTER: 0x00AAFF,        // Cyan-blue (computer spheres, cool and contrasting)
    AMBIENT_LIGHT: 0x7f8787,   // Dim teal-gray (soft ambient glow, dark-mode friendly)
    POINT_LIGHT: 0xCCFFCC      // Pale green (directional light, mimics CRT phosphor)
 };

  let scene, camera, renderer, sphereGroup;
  const matrixSize = 3;
  const nodeRadius = 0.55;
  const gap = 2;

  const playerPoints = new Set();
  const computerPoints = new Set();
  let isPlayerTurn = false; // Start false, set to true on game start
  let playerScore = 0;
  let computerScore = 0;

  let spherical = { radius: 10, phi: Math.PI / 2.5, theta: Math.PI / 6 };
  let isDragging = false;
  let prevMouse = { x: 0, y: 0 };
  let hoveredSphere = null;

  window.startGame = startGame; // Expose for the button

  // Load grid on page load
  init3DMatrix();

  startGameButton.addEventListener("click", startGame);
  howToPlayButton.addEventListener("click", (e) => {
    e.preventDefault();
    rulesModal.style.display = "flex"; // Ensure it can be reopened
  });
  restartButton.addEventListener("click", resetGame);

  function init3DMatrix() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    updateCameraPos();
    camera.lookAt(0, 0, 0);

    resizeRenderer();

    scene.add(new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, 0.6));
    const pl = new THREE.PointLight(COLORS.POINT_LIGHT, 1);
    pl.position.set(9 * Math.sin(Math.PI / 2.5) * Math.cos(Math.PI / 6), 
                    9 * Math.cos(Math.PI / 2.5), 
                    9 * Math.sin(Math.PI / 2.5) * Math.sin(Math.PI / 6));
    scene.add(pl);

    sphereGroup = new THREE.Group();
    for (let x = 0; x < matrixSize; x++) {
      for (let y = 0; y < matrixSize; y++) {
        for (let z = 0; z < matrixSize; z++) {
          const geo = new THREE.SphereGeometry(nodeRadius, 16, 16);
          const mat = new THREE.MeshStandardMaterial({ color: COLORS.DEFAULT_SPHERE, transparent: true, opacity: 0.5 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * gap - gap, y * gap - gap + 0.6, z * gap - gap);
          mesh.userData.index = x * matrixSize * matrixSize + y * matrixSize + z;
          sphereGroup.add(mesh);
        }
      }
    }
    scene.add(sphereGroup);

    canvas.style.pointerEvents = 'auto';
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onMouseWheel);
    canvas.addEventListener("click", onCanvasClick);

    window.addEventListener('resize', () => {
      if (renderer) resizeRenderer();
    });

    animate();
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function updateCameraPos() {
    camera.position.set(
      spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      spherical.radius * Math.cos(spherical.phi),
      spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta)
    );
    camera.lookAt(0, 0, 0);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    console.log("Pointer down at:", e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    handleHover(e);

    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    spherical.theta -= dx * 0.005;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + dy * 0.005));
    prevMouse = { x: e.clientX, y: e.clientY };
    updateCameraPos();
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onMouseWheel(e) {
    e.preventDefault();
    spherical.radius = Math.max(3, Math.min(20, spherical.radius + e.deltaY * 0.01));
    updateCameraPos();
  }

  const raycaster = new THREE.Raycaster();
  function handleHover(e) {
    const rect = canvas.getBoundingClientRect();
    const mouse = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sphereGroup.children, false);

    if (hoveredSphere) {
      if (!playerPoints.has(hoveredSphere.userData.index) && !computerPoints.has(hoveredSphere.userData.index)) {
        hoveredSphere.material.emissive.set(0x000000);
      }
      hoveredSphere = null;
    }
    if (intersects.length) {
      const s = intersects[0].object;
      if (!playerPoints.has(s.userData.index) && !computerPoints.has(s.userData.index)) {
        s.material.emissive.set(COLORS.HOVER);
        s.material.emissiveIntensity = 1.2; // Optional: Boost glow for retro effect
        hoveredSphere = s;
      }
    }
  }

  function onCanvasClick(e) {
    if (isDragging || !isPlayerTurn) return;

    const rect = canvas.getBoundingClientRect();
    const mouse = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sphereGroup.children, false);

    if (intersects.length) {
      const idx = intersects[0].object.userData.index;
      playerMove(idx);
    }
  }

  function playerMove(idx) {
    if (playerPoints.has(idx) || computerPoints.has(idx)) return;
    playerPoints.add(idx);
    animatePlacement(idx, COLORS.PLAYER);
    updateMatrixVisuals();
    checkScore('player');
    isPlayerTurn = false;
    feedbackEl.textContent = "Computer's turn…";
    if (!isGameOver()) setTimeout(computerMove, 500);
    else showWinner();
  }

  function computerMove() {
    let free = [], block = null;
    for (let i = 0; i < matrixSize ** 3; i++) {
      if (!playerPoints.has(i) && !computerPoints.has(i)) {
        free.push(i);
        const hypothetical = new Set([...playerPoints, i]);
        if (getConnectedGroup(i, hypothetical).size >= 3) block = i;
      }
    }
    const idx = block ?? free[Math.floor(Math.random() * free.length)];
    computerPoints.add(idx);
    animatePlacement(idx, COLORS.COMPUTER);
    updateMatrixVisuals();
    checkScore('computer');
    isPlayerTurn = true;
    feedbackEl.textContent = 'Your turn!';
    if (isGameOver()) showWinner();
  }

  function checkScore(side) {
    const points = side === 'player' ? playerPoints : computerPoints;
    let score = 0, comboSpheres = [];
    for (const idx of points) {
      const group = getConnectedGroup(idx, points);
      if (group.size >= 3) {
        score += 10 + (group.size - 3) * 5;
        group.forEach(i => {
          const s = sphereGroup.children.find(sp => sp.userData.index === i);
          if (s && !comboSpheres.includes(s)) comboSpheres.push(s);
        });
      }
    }
    if (side === 'player') { playerScore = score; playerScoreEl.textContent = `Your Score: ${score}`; }
    else { computerScore = score; computerScoreEl.textContent = `Computer Score: ${score}`; }
    if (comboSpheres.length) pulseCombo(comboSpheres);
  }

  function getNeighbors(idx) {
    const x = Math.floor(idx / (matrixSize ** 2));
    const y = Math.floor(idx % (matrixSize ** 2) / matrixSize);
    const z = idx % matrixSize;
    const res = [];
    const dirs = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
    dirs.forEach(([dx, dy, dz]) => {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx >= 0 && ny >= 0 && nz >= 0 && nx < matrixSize && ny < matrixSize && nz < matrixSize) {
        res.push(nx * matrixSize * matrixSize + ny * matrixSize + nz);
      }
    });
    return res;
  }

  function getConnectedGroup(start, set) {
    const stack = [start], group = new Set([start]);
    while (stack.length) {
      const cur = stack.pop();
      getNeighbors(cur).forEach(n => {
        if (set.has(n) && !group.has(n)) {
          group.add(n);
          stack.push(n);
        }
      });
    }
    return group;
  }

  function animatePlacement(idx, color) {
    const s = sphereGroup.children.find(sp => sp.userData.index === idx);
    if (!s) return;
    s.material.color.set(color);
    s.material.opacity = 1;
    s.scale.set(0, 0, 0);
    anime({
      targets: s.scale,
      x: 1, y: 1, z: 1,
      duration: 300,
      easing: 'easeOutElastic(1, 0.8)'
    });
  }

  function pulseCombo(arr) {
    anime({
      targets: arr.map(s => s.scale),
      x: [1, 1.2, 1], y: [1, 1.2, 1], z: [1, 1.2, 1],
      duration: 1000, loop: 2, easing: 'easeInOutSine'
    });
  }

  function updateMatrixVisuals() {
    sphereGroup.children.forEach(s => {
      const idx = s.userData.index;
      if (!playerPoints.has(idx) && !computerPoints.has(idx)) {
        s.material.color.set(0x4B5563);
        s.material.opacity = 0.5;
        s.material.emissive.set(0x000000);
      }
    });
  }

  function isGameOver() {
    return playerPoints.size + computerPoints.size >= matrixSize ** 3;
  }

  function showWinner() {
    const txt = playerScore > computerScore ? "You win!" : playerScore < computerScore ? "Computer wins!" : "It’s a tie!";
    feedbackEl.textContent = `Game Over! ${txt}`;
  }

  function startGame() {
    resetGame();
    rulesModal.style.display = "none";
    isPlayerTurn = true;
    feedbackEl.textContent = "Your turn!";
  }

  function resetGame() {
    playerPoints.clear();
    computerPoints.clear();
    playerScore = computerScore = 0;
    playerScoreEl.textContent = "Your Score: 0";
    computerScoreEl.textContent = "Computer Score: 0";
    updateMatrixVisuals();

    sphereGroup.children.forEach(s => {
      s.material.color.set(0x4B5563);
      s.material.opacity = 0.5;
      s.material.emissive.set(0x000000);
      s.scale.set(1, 1, 1);
    });
    anime.remove(sphereGroup.children.map(s => s.scale));
    spherical = { radius: 10, phi: Math.PI / 2.5, theta: Math.PI / 6 };
    updateCameraPos();
  }

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
});