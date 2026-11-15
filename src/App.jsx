import React from 'react';
import CareFlow from './components/CareFlow.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { SkipLink, HomeHeader, HomeMethod, HomeFooter } from './components/HomeLayout.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';

// Layout follows design direction 1 (stock Astryx structure) with the SUNFIT orange theme.
export default function App() {
  const model = useCare();
  return (
    <VStack gap={6} padding={6} maxWidth={1200} style={{ marginInline: 'auto' }}>
      <SkipLink />
      <HomeHeader />
      <VStack as="main" gap={6}>
        <CareFlow model={model} />
        <VStack as="section" id="care" gap={5} aria-label="재도포 일정">
          <CareDashboard model={model} />
        </VStack>
        <HomeMethod />
      </VStack>
      <HomeFooter />
    </VStack>
  );
}
