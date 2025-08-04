document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("matrix3d");
  const feedbackEl = document.getElementById("feedback");
  const playerScoreEl = document.getElementById("playerScore");
  const computerScoreEl = document.getElementById("computerScore");
  const startGameButton = document.getElementById("startGameButton");
  const howToPlayButton = document.getElementById("howToPlayButton");
  const rulesModal = document.getElementById("rulesModal");
  const restartButton = document.querySelector("#hud button");
  const audioToggle = document.getElementById("audioToggle");

  // Audio setup
  const bgMusic = new Audio("gameplay_track.mp3");
  bgMusic.loop = true;
  bgMusic.volume = 0.3;
  let isMuted = true;

  // Initialize audio state
  function initAudio() {
    console.log("Initializing audio..."); // Debug
    bgMusic.muted = isMuted;
    audioToggle.classList.add("muted");
    updateAudioIcon();
  }

  // Update audio icon based on state
  function updateAudioIcon() {
    console.log("Updating icon, muted:", isMuted); // Debug
    audioToggle.innerHTML = isMuted
      ? '<i class="fa-solid fa-volume-mute"></i>'
      : '<i class="fa-solid fa-volume-up"></i>';
  }

  // Toggle audio
  audioToggle.addEventListener("click", function (e) {
    e.stopPropagation(); // Prevent event bubbling
    console.log("Audio button clicked"); // Debug

    isMuted = !isMuted;
    bgMusic.muted = isMuted;

    // Force remove and add class instead of toggle
    audioToggle.classList.remove("muted");
    if (isMuted) {
      audioToggle.classList.add("muted");
    }

    if (!isMuted && bgMusic.paused) {
      bgMusic.play().catch((error) => {
        console.log("Playback failed:", error);
        isMuted = true;
        bgMusic.muted = true;
        audioToggle.classList.add("muted");
      });
    }

    updateAudioIcon();
  });

  // Initialize audio
  initAudio();

  const COLORS = {
    DEFAULT_SPHERE: 0x1a2525, // Dark teal-gray (unclaimed spheres, subtle and moody)
    HOVER: 0x00ff55, // Pale CRT green (hover highlight, glowing effect)
    PLAYER: 0x6bff9c, // Light CRT green (player spheres, warm and distinct)
    COMPUTER: 0x00aaff, // Cyan-blue (computer spheres, cool and contrasting)
    AMBIENT_LIGHT: 0x7f8787, // Dim teal-gray (soft ambient glow, dark-mode friendly)
    POINT_LIGHT: 0xccffcc, // Pale green (directional light, mimics CRT phosphor)
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

  // Add these variables near the top with other state variables
  let touchStartDistance = 0;
  let isTouchZooming = false;
  let touchStartTime = 0;
  let touchMoved = false;
  let touchStartPos = { x: 0, y: 0 };

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
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    updateCameraPos();
    camera.lookAt(0, 0, 0);

    resizeRenderer();

    scene.add(new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, 0.6));
    const pl = new THREE.PointLight(COLORS.POINT_LIGHT, 1);
    pl.position.set(
      9 * Math.sin(Math.PI / 2.5) * Math.cos(Math.PI / 6),
      9 * Math.cos(Math.PI / 2.5),
      9 * Math.sin(Math.PI / 2.5) * Math.sin(Math.PI / 6)
    );
    scene.add(pl);

    sphereGroup = new THREE.Group();
    for (let x = 0; x < matrixSize; x++) {
      for (let y = 0; y < matrixSize; y++) {
        for (let z = 0; z < matrixSize; z++) {
          const geo = new THREE.SphereGeometry(nodeRadius, 16, 16);
          const mat = new THREE.MeshStandardMaterial({
            color: COLORS.DEFAULT_SPHERE,
            transparent: true,
            opacity: 0.5,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * gap - gap, y * gap - gap + 1.5, z * gap - gap); // Changed 0.6 to 1.5
          mesh.userData.index =
            x * matrixSize * matrixSize + y * matrixSize + z;
          sphereGroup.add(mesh);
        }
      }
    }
    scene.add(sphereGroup);

    // Just initialize system message without showing it
    const systemMessage = document.getElementById("systemMessage");
    systemMessage.style.display = "none";
    systemMessage.style.opacity = 0;

    canvas.style.pointerEvents = "auto";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onMouseWheel);
    canvas.addEventListener("click", onCanvasClick);

    // Add touch event listeners
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    window.addEventListener("resize", () => {
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
    spherical.phi = Math.max(
      0.1,
      Math.min(Math.PI - 0.1, spherical.phi + dy * 0.005)
    );
    prevMouse = { x: e.clientX, y: e.clientY };
    updateCameraPos();
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onMouseWheel(e) {
    e.preventDefault();
    spherical.radius = Math.max(
      3,
      Math.min(20, spherical.radius + e.deltaY * 0.01)
    );
    updateCameraPos();
  }

  const raycaster = new THREE.Raycaster();
  function handleHover(e) {
    const rect = canvas.getBoundingClientRect();
    const mouse = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sphereGroup.children, false);

    if (hoveredSphere) {
      if (
        !playerPoints.has(hoveredSphere.userData.index) &&
        !computerPoints.has(hoveredSphere.userData.index)
      ) {
        hoveredSphere.material.emissive.set(0x000000);
      }
      hoveredSphere = null;
    }
    if (intersects.length) {
      const s = intersects[0].object;
      if (
        !playerPoints.has(s.userData.index) &&
        !computerPoints.has(s.userData.index)
      ) {
        s.material.emissive.set(COLORS.HOVER);
        s.material.emissiveIntensity = 1.2; // Optional: Boost glow for retro effect
        hoveredSphere = s;
      }
    }
  }

  // Modify the existing onCanvasClick function to prevent accidental touches
  function onCanvasClick(e) {
    if (isDragging || isTouchZooming || !isPlayerTurn) return;
    handleClick(e);
  }

  // Extract click handling logic to a separate function
  function handleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mouse = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sphereGroup.children, false);

    if (intersects.length) {
      const sphere = intersects[0].object;
      const idx = sphere.userData.index;

      // Only process click if the sphere is unclaimed
      if (!playerPoints.has(idx) && !computerPoints.has(idx)) {
        // Reset any existing hover effects
        if (hoveredSphere) {
          hoveredSphere.material.emissive.set(0x000000);
          hoveredSphere = null;
        }

        // Ensure sphere uses correct player color
        sphere.material.color.set(COLORS.PLAYER);
        sphere.material.opacity = 1;

        playerMove(idx);
      }
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    touchStartTime = Date.now();
    touchMoved = false;

    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      isTouchZooming = true;
    } else if (e.touches.length === 1) {
      isDragging = true;
      const touch = e.touches[0];
      touchStartPos = { x: touch.clientX, y: touch.clientY };
      prevMouse = { x: touch.clientX, y: touch.clientY };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();

    // Track if the touch has moved significantly
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const moveDistance = Math.hypot(
        touch.clientX - touchStartPos.x,
        touch.clientY - touchStartPos.y
      );
      if (moveDistance > 10) {
        // 10px threshold
        touchMoved = true;
      }
    }

    // Handle zoom and rotation
    if (e.touches.length === 2 && isTouchZooming) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const delta = touchStartDistance - currentDistance;
      spherical.radius = Math.max(
        3,
        Math.min(30, spherical.radius + delta * 0.01)
      );
      touchStartDistance = currentDistance;
      updateCameraPos();
    } else if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - prevMouse.x;
      const dy = touch.clientY - prevMouse.y;
      spherical.theta -= dx * 0.005;
      spherical.phi = Math.max(
        0.1,
        Math.min(Math.PI - 0.1, spherical.phi + dy * 0.005)
      );
      prevMouse = { x: touch.clientX, y: touch.clientY };
      updateCameraPos();
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();

    // Handle tap for sphere selection
    if (
      !touchMoved &&
      e.changedTouches.length === 1 &&
      Date.now() - touchStartTime < 300
    ) {
      const touch = e.changedTouches[0];
      handleClick({
        clientX: touch.clientX,
        clientY: touch.clientY,
        pointerType: "touch",
      });
    }

    isDragging = false;
    isTouchZooming = false;
  }

  function playerMove(idx) {
    if (playerPoints.has(idx) || computerPoints.has(idx)) return;
    playerPoints.add(idx);
    animatePlacement(idx, COLORS.PLAYER);
    updateMatrixVisuals();
    checkScore("player");
    isPlayerTurn = false;
    feedbackEl.textContent = "Computer's turn…";
    if (!isGameOver()) setTimeout(computerMove, 500);
    else showWinner();
  }

  function computerMove() {
    let free = [],
      block = null;
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
    checkScore("computer");
    isPlayerTurn = true;
    feedbackEl.textContent = "Your turn!";
    if (isGameOver()) showWinner();
  }

  function checkScore(side) {
    const points = side === "player" ? playerPoints : computerPoints;
    let score = 0,
      comboSpheres = [];
    for (const idx of points) {
      const group = getConnectedGroup(idx, points);
      if (group.size >= 3) {
        score += 10 + (group.size - 3) * 5;
        group.forEach((i) => {
          const s = sphereGroup.children.find((sp) => sp.userData.index === i);
          if (s && !comboSpheres.includes(s)) comboSpheres.push(s);
        });
      }
    }
    if (side === "player") {
      playerScore = score;
      playerScoreEl.textContent = `Your Score: ${score}`;
    } else {
      computerScore = score;
      computerScoreEl.textContent = `Computer Score: ${score}`;
    }
    if (comboSpheres.length) pulseCombo(comboSpheres);
  }

  function getNeighbors(idx) {
    const x = Math.floor(idx / matrixSize ** 2);
    const y = Math.floor((idx % matrixSize ** 2) / matrixSize);
    const z = idx % matrixSize;
    const res = [];
    const dirs = [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ];
    dirs.forEach(([dx, dy, dz]) => {
      const nx = x + dx,
        ny = y + dy,
        nz = z + dz;
      if (
        nx >= 0 &&
        ny >= 0 &&
        nz >= 0 &&
        nx < matrixSize &&
        ny < matrixSize &&
        nz < matrixSize
      ) {
        res.push(nx * matrixSize * matrixSize + ny * matrixSize + nz);
      }
    });
    return res;
  }

  function getConnectedGroup(start, set) {
    const stack = [start],
      group = new Set([start]);
    while (stack.length) {
      const cur = stack.pop();
      getNeighbors(cur).forEach((n) => {
        if (set.has(n) && !group.has(n)) {
          group.add(n);
          stack.push(n);
        }
      });
    }
    return group;
  }

  function animatePlacement(idx, color) {
    const s = sphereGroup.children.find((sp) => sp.userData.index === idx);
    if (!s) return;
    s.material.color.set(color);
    s.material.opacity = 1;
    s.scale.set(0, 0, 0);
    anime({
      targets: s.scale,
      x: 1,
      y: 1,
      z: 1,
      duration: 200,
      easing: "easeOutElastic(1, 0.8)",
    });
  }

  function pulseCombo(arr) {
    anime({
      targets: arr.map((s) => s.scale),
      x: [1, 1.2, 1],
      y: [1, 1.2, 1],
      z: [1, 1.2, 1],
      duration: 500,
      loop: 2,
      easing: "easeInOutSine",
    });
  }

  // Add this function near your other animation functions
  function animateLoserSpheres(loserPoints) {
    const spheres = sphereGroup.children.filter((s) =>
      loserPoints.has(s.userData.index)
    );

    spheres.forEach((sphere) => {
      // Random horizontal velocity
      const randomX = (Math.random() - 0.5) * 0.1;
      const randomZ = (Math.random() - 0.5) * 0.1;

      anime({
        targets: sphere.position,
        y: [-2, -10], // Fall down
        x: `+=${randomX * 20}`, // Spread out horizontally
        z: `+=${randomZ * 20}`,
        duration: 1500,
        easing: "easeInQuad",
        complete: () => {
          // Fade out as they fall
          anime({
            targets: sphere.material,
            opacity: 0,
            duration: 800,
            easing: "linear",
          });
        },
      });
    });
  }

  function updateMatrixVisuals() {
    sphereGroup.children.forEach((s) => {
      const idx = s.userData.index;
      if (!playerPoints.has(idx) && !computerPoints.has(idx)) {
        s.material.color.set(0x4b5563);
        s.material.opacity = 0.5;
        s.material.emissive.set(0x000000);
      }
    });
  }

  function isGameOver() {
    return playerPoints.size + computerPoints.size >= matrixSize ** 3;
  }

  // Modify the showWinner function
  function showWinner() {
    const playerWon = playerScore > computerScore;
    const txt = playerWon
      ? "You win!"
      : playerScore < computerScore
      ? "Computer wins!"
      : "It's a tie!";
    feedbackEl.textContent = `Game Over! ${txt}`;

    // Show end game message with animation
    const gameEndMessage = document.getElementById("gameEndMessage");
    gameEndMessage.textContent = playerWon
      ? "VICTORY!"
      : playerScore < computerScore
      ? "GAME OVER"
      : "IT'S A TIE!";
    gameEndMessage.style.display = "block";

    // Animate the message
    anime({
      targets: gameEndMessage,
      opacity: [0, 1],
      scale: [0.5, 1],
      duration: 1000,
      easing: "easeOutElastic(1, 0.8)",
      complete: () => {
        // Add pulsing effect after initial animation
        anime({
          targets: gameEndMessage,
          scale: [1, 1.1],
          textShadow: [
            "0 0 10px #00FF55",
            "0 0 20px #00FF55",
            "0 0 10px #00FF55",
          ],
          duration: 800,
          direction: "alternate",
          loop: true,
          easing: "easeInOutSine",
        });
      },
    });

    // Don't animate on tie games
    if (playerScore !== computerScore) {
      const loserPoints = playerWon ? computerPoints : playerPoints;
      animateLoserSpheres(loserPoints);
    }
  }

  function startGame() {
    resetGame();
    rulesModal.style.display = "none";
    isPlayerTurn = true;
    feedbackEl.textContent = "Your turn!";
  }

  function resetGame() {
    // Only show system message if game was already started (not first load)
    const isRestart = playerPoints.size > 0 || computerPoints.size > 0;

    // Hide end game message
    const gameEndMessage = document.getElementById("gameEndMessage");
    anime.remove(gameEndMessage);
    gameEndMessage.style.display = "none";
    gameEndMessage.style.opacity = 0;

    // Stop any ongoing animations first
    anime.remove(sphereGroup.children);

    playerPoints.clear();
    computerPoints.clear();
    playerScore = computerScore = 0;
    playerScoreEl.textContent = "Your Score: 0";
    computerScoreEl.textContent = "Computer Score: 0";

    // Only show reassembly message on restart
    if (isRestart) {
      const systemMessage = document.getElementById("systemMessage");
      systemMessage.textContent = "Reassembling matrix...";
      systemMessage.style.display = "block";

      anime({
        targets: systemMessage,
        opacity: [0, 1],
        duration: 500,
        easing: "easeOutQuad",
        complete: () => {
          setTimeout(() => {
            anime({
              targets: systemMessage,
              opacity: 0,
              duration: 500,
              easing: "easeInQuad",
              complete: () => {
                systemMessage.style.display = "none";
              },
            });
          }, 2000);
        },
      });
    }

    // Reset all spheres with a staggered animation
    sphereGroup.children.forEach((s, i) => {
      const idx = s.userData.index;
      const x = Math.floor(idx / (matrixSize * matrixSize));
      const y = Math.floor((idx % (matrixSize * matrixSize)) / matrixSize);
      const z = idx % matrixSize;

      // Calculate final position with new Y offset
      const targetX = x * gap - gap;
      const targetY = y * gap - gap + 1.5; // Changed 0.6 to 1.5
      const targetZ = z * gap - gap;

      // Reset material properties
      s.material.color.set(COLORS.DEFAULT_SPHERE);
      s.material.opacity = 0.5;
      s.material.emissive.set(0x000000);
      s.scale.set(1, 1, 1);

      // Animate sphere back to position
      anime({
        targets: s.position,
        x: targetX,
        y: targetY,
        z: targetZ,
        duration: 1200,
        delay: i * 50, // Stagger the animations
        easing: "easeOutElastic(1, 0.8)",
        complete: () => {
          // Ensure final position is exact
          s.position.set(targetX, targetY, targetZ);
        },
      });
    });

    // Reset camera position
    spherical = { radius: 10, phi: Math.PI / 2.5, theta: Math.PI / 6 };
    updateCameraPos();

    updateMatrixVisuals();
  }

  // Add close button handler
  document.querySelector(".modal-close").addEventListener("click", () => {
    rulesModal.style.display = "none";
    startGame();
  });

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
});
