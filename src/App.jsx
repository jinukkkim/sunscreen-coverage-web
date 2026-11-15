import React from 'react';
import CareFlow from './components/CareFlow.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { HomeHeader, HomeMethod, HomeFooter } from './components/HomeLayout.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';
import './home.css';

export default function App() {
  const model = useCare();
  return (
    <VStack className="sunguard-home" gap={6} padding={6} maxWidth={1280} style={{ marginInline: 'auto' }}>
      <a className="skip-link" href="#workspace">가이드로 건너뛰기</a>
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
