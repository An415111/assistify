
import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ProjectDetails from './components/ProjectDetails';
import ChatbotSimulator from './components/ChatbotSimulator';
import Footer from './components/Footer';

const Display: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <Hero />
        <ProjectDetails />
        <ChatbotSimulator />
      </main>
      <Footer />
    </div>
  );
};

export default Display;
