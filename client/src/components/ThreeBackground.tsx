'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Mesh, Vector3 } from 'three';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';

function FloatingOrbs() {
  const meshRefs = useRef<Mesh[]>([]);

  useFrame(({ clock }) => {
    meshRefs.current.forEach((mesh, i) => {
      if (mesh) {
        const time = clock.getElapsedTime();
        mesh.position.y = Math.sin(time + i) * 0.5;
        mesh.rotation.x = time * 0.2;
        mesh.rotation.y = time * 0.3;
      }
    });
  });

  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) meshRefs.current[i] = el;
          }}
          position={[
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
          ]}
        >
          <icosahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#3b82f6' : '#8b5cf6'}
            emissive={i % 2 === 0 ? '#3b82f6' : '#8b5cf6'}
            emissiveIntensity={0.3}
            wireframe
          />
        </mesh>
      ))}
    </>
  );
}

export default function ThreeBackground() {
  return (
    <div className="fixed inset-0 -z-10 opacity-30">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <FloatingOrbs />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}
