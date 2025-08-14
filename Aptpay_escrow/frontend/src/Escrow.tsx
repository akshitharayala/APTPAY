import React, { useState, useEffect } from 'react';
import './Escrow.css';

// TypeScript interfaces
interface Milestone {
  description: string;
  amount: number;
  status: 'pending' | 'completed' | 'paid';
}

interface Contract {
  id: number;
  client: string;
  freelancer: string | null;
  title: string;
  description: string;
  skills: string;
  totalPayment: number;
  milestones: Milestone[];
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: string;
  acceptedAt?: string;
}

interface ContractForm {
  title: string;
  description: string;
  skills: string;
  totalPayment: number;
  milestones: { description: string; amount: number }[];
}

type UserType = 'client' | 'freelancer' | '';
type PageType = 'home' | 'clientDashboard' | 'freelancerDashboard' | 'createWork' | 'contractDetails';

const EscrowApp: React.FC = () => {
  // State management
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [userType, setUserType] = useState<UserType>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string>('');

  // Form states
  const [contractForm, setContractForm] = useState<ContractForm>({
    title: '',
    description: '',
    skills: '',
    totalPayment: 0,
    milestones: [{ description: '', amount: 0 }]
  });

  // Load contracts from localStorage on component mount
  useEffect(() => {
    const savedContracts = localStorage.getItem('escrowContracts');
    if (savedContracts) {
      try {
        const parsed: Contract[] = JSON.parse(savedContracts);
        setContracts(parsed);
      } catch (error) {
        console.error('Error parsing saved contracts:', error);
      }
    }
  }, []);

  // Save contracts to localStorage whenever contracts change
  useEffect(() => {
    localStorage.setItem('escrowContracts', JSON.stringify(contracts));
  }, [contracts]);

  // Check if Petra wallet is installed
  const isPetraInstalled = (): boolean => {
    return !!(window as any).aptos;
  };

  // Connect to Petra wallet
  const connectWallet = async (): Promise<boolean> => {
    setIsConnecting(true);
    setWalletError('');
    
    try {
      // Check if Petra wallet is installed
      if (!isPetraInstalled()) {
        setWalletError('Petra wallet is not installed. Please install Petra wallet extension first.');
        setIsConnecting(false);
        return false;
      }

      const wallet = (window as any).aptos;
      
      // Request connection to Petra wallet
      const response = await wallet.connect();
      
      if (response) {
        // Get account information
        const account = await wallet.account();
        setWalletAddress(account.address);
        setIsConnecting(false);
        return true;
      } else {
        setWalletError('Failed to connect to Petra wallet. Please try again.');
        setIsConnecting(false);
        return false;
      }
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      
      // Handle different types of errors
      if (error.code === 4001) {
        setWalletError('Connection request was rejected. Please approve the connection in Petra wallet.');
      } else if (error.message?.includes('User rejected')) {
        setWalletError('Connection was cancelled by user.');
      } else {
        setWalletError('Failed to connect to Petra wallet. Please make sure it\'s unlocked and try again.');
      }
      
      setIsConnecting(false);
      return false;
    }
  };

  // Check wallet connection status on component mount
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (isPetraInstalled()) {
        try {
          const wallet = (window as any).aptos;
          const isConnected = await wallet.isConnected();
          
          if (isConnected) {
            const account = await wallet.account();
            setWalletAddress(account.address);
          }
        } catch (error) {
          console.log('Wallet not connected or error checking connection:', error);
        }
      }
    };

    checkWalletConnection();
  }, []);

  // Handle navigation
  const navigateTo = (page: PageType, data?: Contract): void => {
    setCurrentPage(page);
    if (data) setSelectedContract(data);
  };

  // Reset app state
  const resetApp = (): void => {
    setWalletAddress('');
    setUserType('');
    setCurrentPage('home');
    setSelectedContract(null);
    setWalletError('');
    
    // Disconnect from Petra wallet
    if (isPetraInstalled()) {
      try {
        (window as any).aptos.disconnect();
      } catch (error) {
        console.log('Error disconnecting wallet:', error);
      }
    }
  };

  // Add milestone to form
  const addMilestone = (): void => {
    setContractForm(prev => ({
      ...prev,
      milestones: [...prev.milestones, { description: '', amount: 0 }]
    }));
  };

  // Remove milestone from form
  const removeMilestone = (index: number): void => {
    if (contractForm.milestones.length > 1) {
      setContractForm(prev => ({
        ...prev,
        milestones: prev.milestones.filter((_, i) => i !== index)
      }));
    }
  };

  // Update milestone in form
  const updateMilestone = (index: number, field: 'description' | 'amount', value: string | number): void => {
    setContractForm(prev => ({
      ...prev,
      milestones: prev.milestones.map((milestone, i) =>
        i === index ? { ...milestone, [field]: value } : milestone
      )
    }));
  };

  // Calculate total payment from milestones
  const calculateTotal = (): number => {
    return contractForm.milestones.reduce((sum, milestone) => sum + (Number(milestone.amount) || 0), 0);
  };

  // Validate form
  const isFormValid = (): boolean => {
    return !!(
      contractForm.title.trim() &&
      contractForm.description.trim() &&
      contractForm.skills.trim() &&
      calculateTotal() > 0 &&
      contractForm.milestones.every(m => m.description.trim() && m.amount > 0)
    );
  };

  // Create new contract
  const createContract = (): void => {
    if (!isFormValid()) {
      alert('Please fill all required fields');
      return;
    }

    const newContract: Contract = {
      id: Date.now(),
      client: walletAddress,
      freelancer: null,
      title: contractForm.title,
      description: contractForm.description,
      skills: contractForm.skills,
      totalPayment: calculateTotal(),
      milestones: contractForm.milestones.map(m => ({ ...m, status: 'pending' as const })),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    setContracts(prev => [...prev, newContract]);
    setContractForm({
      title: '',
      description: '',
      skills: '',
      totalPayment: 0,
      milestones: [{ description: '', amount: 0 }]
    });
    navigateTo('clientDashboard');
  };

  // Accept contract
  const acceptContract = (contractId: number): void => {
    setContracts(prev =>
      prev.map(contract =>
        contract.id === contractId
          ? { 
              ...contract, 
              status: 'accepted' as const, 
              freelancer: walletAddress,
              acceptedAt: new Date().toISOString()
            }
          : contract
      )
    );
  };

  // Skip contract
  const skipContract = (contractId: number): void => {
    console.log(`Contract ${contractId} skipped by ${walletAddress}`);
    // In a real implementation, this would track skipped contracts per user
  };

  // Release payment for milestone
  const releasePayment = (contractId: number, milestoneIndex: number): void => {
    setContracts(prev =>
      prev.map(contract => {
        if (contract.id === contractId) {
          const updatedMilestones = contract.milestones.map((milestone, index) =>
            index === milestoneIndex ? { ...milestone, status: 'paid' as const } : milestone
          );
          
          const allPaid = updatedMilestones.every(m => m.status === 'paid');
          
          return {
            ...contract,
            milestones: updatedMilestones,
            status: allPaid ? 'completed' as const : contract.status
          };
        }
        return contract;
      })
    );
  };

  // Mark milestone as completed (freelancer action)
  const markMilestoneCompleted = (contractId: number, milestoneIndex: number): void => {
    setContracts(prev =>
      prev.map(contract => {
        if (contract.id === contractId) {
          const updatedMilestones = contract.milestones.map((milestone, index) =>
            index === milestoneIndex ? { ...milestone, status: 'completed' as const } : milestone
          );
          
          return {
            ...contract,
            milestones: updatedMilestones
          };
        }
        return contract;
      })
    );
  };

  // Get contracts for current user
  const getUserContracts = (): Contract[] => {
    if (userType === 'client') {
      return contracts.filter(contract => contract.client === walletAddress);
    } else if (userType === 'freelancer') {
      return contracts.filter(contract => 
        contract.status === 'pending' || contract.freelancer === walletAddress
      );
    }
    return [];
  };

  // Get status color
  const getStatusColor = (status: Contract['status']): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-400';
      case 'accepted':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  // Get status display text
  const getStatusText = (status: Contract['status']): string => {
    switch (status) {
      case 'pending':
        return 'Open';
      case 'accepted':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  // Format wallet address for display
  const formatWalletAddress = (address: string): string => {
    if (address.length <= 14) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Home Page Component
  const HomePage: React.FC = () => (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">
            Aptos Escrow System
          </h1>
          <div className="flex items-center justify-center mb-6">
            <div className="w-10 h-10 bg-cyan-500 rounded-lg mr-3 flex items-center justify-center">
              <div className="w-6 h-6 bg-white rounded"></div>
            </div>
            <span className="text-gray-300 text-lg">Connect with Petra Wallet</span>
          </div>
        </div>
        
        {!walletAddress ? (
          <div>
            {!isPetraInstalled() && (
              <div className="bg-red-900 border border-red-700 text-red-300 p-4 rounded-lg mb-4">
                <p className="font-semibold mb-2">Petra Wallet Required</p>
                <p className="text-sm mb-3">
                  You need to install Petra wallet extension to use this app.
                </p>
                <a
                  href="https://petra.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  Install Petra Wallet
                </a>
              </div>
            )}
            
            <button
              onClick={connectWallet}
              disabled={isConnecting || !isPetraInstalled()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-4"
            >
              {isConnecting ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Connecting to Petra...
                </div>
              ) : (
                'Connect Petra Wallet'
              )}
            </button>
            
            {walletError && (
              <div className="bg-red-900 border border-red-700 text-red-300 p-3 rounded-lg mb-4 text-sm">
                {walletError}
              </div>
            )}
            
            <div className="text-center text-gray-400 text-sm">
              <p>Make sure Petra wallet is installed and unlocked</p>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 p-3 bg-green-900 rounded-lg">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
                <p className="text-green-300 text-sm">
                  Connected: {formatWalletAddress(walletAddress)}
                </p>
              </div>
              <button
                onClick={resetApp}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Disconnect
              </button>
            </div>
            
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value as UserType)}
              className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select User Type</option>
              <option value="client">Client (Post Projects)</option>
              <option value="freelancer">Freelancer (Find Work)</option>
            </select>
            
            <button
              onClick={() => navigateTo(userType === 'client' ? 'clientDashboard' : 'freelancerDashboard')}
              disabled={!userType}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Enter Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Contract Card Component
  const ContractCard: React.FC<{ contract: Contract; isFreelancer?: boolean }> = ({ 
    contract, 
    isFreelancer = false 
  }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
      <h3 className="text-xl font-bold text-white mb-2">{contract.title}</h3>
      <p className="text-gray-300 mb-4 line-clamp-3">{contract.description}</p>
      <div className="space-y-2 mb-4">
        <p className="text-blue-400">
          <span className="font-semibold">Skills:</span> {contract.skills}
        </p>
        <p className="text-green-400">
          <span className="font-semibold">Total Payment:</span> {contract.totalPayment} APT
        </p>
        <p className={`${getStatusColor(contract.status)}`}>
          <span className="font-semibold">Status:</span> {getStatusText(contract.status)}
        </p>
        <p className="text-gray-400 text-sm">
          <span className="font-semibold">Milestones:</span> {contract.milestones.length}
        </p>
        <p className="text-gray-500 text-xs">
          Created: {new Date(contract.createdAt).toLocaleDateString()}
        </p>
      </div>
      
      {isFreelancer && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => navigateTo('contractDetails', contract)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            View Details
          </button>
          {contract.status === 'pending' && (
            <>
              <button
                onClick={() => acceptContract(contract.id)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors text-sm"
              >
                Accept
              </button>
              <button
                onClick={() => skipContract(contract.id)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors text-sm"
              >
                Skip
              </button>
            </>
          )}
        </div>
      )}

      {!isFreelancer && userType === 'client' && (
        <div className="mt-4">
          <button
            onClick={() => navigateTo('contractDetails', contract)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            Manage Contract
          </button>
        </div>
      )}
    </div>
  );

  // Client Dashboard Component
  const ClientDashboard: React.FC = () => {
    const userContracts = getUserContracts();
    const stats = {
      total: userContracts.length,
      pending: userContracts.filter(c => c.status === 'pending').length,
      active: userContracts.filter(c => c.status === 'accepted').length,
      completed: userContracts.filter(c => c.status === 'completed').length
    };

    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Client Dashboard</h1>
              <p className="text-gray-400 mt-2">Manage your contracts and create new projects</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => navigateTo('createWork')}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Create New Contract
              </button>
              <button
                onClick={() => navigateTo('home')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-gray-400 text-sm">Total Contracts</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
              <div className="text-gray-400 text-sm">Pending</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
              <div className="text-gray-400 text-sm">Active</div>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
              <div className="text-gray-400 text-sm">Completed</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {getUserContracts().map(contract => (
              <ContractCard key={contract.id} contract={contract} />
            ))}
          </div>
          
          {getUserContracts().length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <div className="bg-gray-800 p-8 rounded-lg">
                <p className="text-lg mb-4">No contracts found</p>
                <p className="mb-6">Create your first contract to get started!</p>
                <button
                  onClick={() => navigateTo('createWork')}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Create Contract
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Freelancer Dashboard Component
  const FreelancerDashboard: React.FC = () => {
    const userContracts = getUserContracts();
    const availableContracts = userContracts.filter(c => c.status === 'pending');
    const myContracts = userContracts.filter(c => c.freelancer === walletAddress);

    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Freelancer Dashboard</h1>
              <p className="text-gray-400 mt-2">Browse available contracts and manage your work</p>
            </div>
            <button
              onClick={() => navigateTo('home')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Back to Home
            </button>
          </div>
          
          <div className="mb-6">
            <div className="flex gap-4 text-sm">
              <span className="text-yellow-400">● Available: {availableContracts.length}</span>
              <span className="text-blue-400">● In Progress: {myContracts.filter(c => c.status === 'accepted').length}</span>
              <span className="text-green-400">● Completed: {myContracts.filter(c => c.status === 'completed').length}</span>
            </div>
          </div>

          {/* Available Contracts Section */}
          {availableContracts.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-6">Available Contracts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableContracts.map(contract => (
                  <ContractCard key={contract.id} contract={contract} isFreelancer={true} />
                ))}
              </div>
            </div>
          )}

          {/* My Contracts Section */}
          {myContracts.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-6">My Contracts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myContracts.map(contract => (
                  <ContractCard key={contract.id} contract={contract} isFreelancer={true} />
                ))}
              </div>
            </div>
          )}
          
          {getUserContracts().length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <div className="bg-gray-800 p-8 rounded-lg">
                <p className="text-lg mb-4">No contracts available</p>
                <p>Check back later for new opportunities!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Create Work Page Component
  const CreateWorkPage: React.FC = () => (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Create New Contract</h1>
            <p className="text-gray-400 mt-2">Define your project requirements and milestones</p>
          </div>
          <button
            onClick={() => navigateTo('clientDashboard')}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>
        
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-white mb-2 font-semibold">Project Title *</label>
              <input
                type="text"
                value={contractForm.title}
                onChange={(e) => setContractForm(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project title"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-white mb-2 font-semibold">Required Skills *</label>
              <input
                type="text"
                value={contractForm.skills}
                onChange={(e) => setContractForm(prev => ({ ...prev, skills: e.target.value }))}
                className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., React, Node.js, Design"
                maxLength={200}
              />
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-white mb-2 font-semibold">Description *</label>
            <textarea
              value={contractForm.description}
              onChange={(e) => setContractForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-gray-700 text-white p-3 rounded-lg h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe your project requirements in detail"
              maxLength={1000}
            />
            <p className="text-gray-400 text-xs mt-1">
              {contractForm.description.length}/1000 characters
            </p>
          </div>
          
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <label className="block text-white font-semibold">Milestones *</label>
              <button
                onClick={addMilestone}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors text-sm"
              >
                Add Milestone
              </button>
            </div>
            
            {contractForm.milestones.map((milestone, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded-lg mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-white font-semibold">Milestone {index + 1}</h4>
                  {contractForm.milestones.length > 1 && (
                    <button
                      onClick={() => removeMilestone(index)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={milestone.description}
                    onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                    className="bg-gray-600 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Milestone description"
                    maxLength={200}
                  />
                  <input
                    type="number"
                    value={milestone.amount || ''}
                    onChange={(e) => updateMilestone(index, 'amount', parseFloat(e.target.value) || 0)}
                    className="bg-gray-600 text-white p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Amount (APT)"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            ))}
            
            <div className="text-right">
              <p className="text-green-400 font-bold text-lg">
                Total Payment: {calculateTotal().toFixed(2)} APT
              </p>
            </div>
          </div>
          
          <button
            onClick={createContract}
            disabled={!isFormValid()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Create Contract
          </button>
        </div>
      </div>
    </div>
  );

  // Contract Details Page Component
  const ContractDetailsPage: React.FC = () => {
    const isClient = selectedContract?.client === walletAddress;
    const isFreelancer = selectedContract?.freelancer === walletAddress;

    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">Contract Details</h1>
            <button
              onClick={() => navigateTo(userType === 'client' ? 'clientDashboard' : 'freelancerDashboard')}
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Back
            </button>
          </div>
          
          {selectedContract && (
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">{selectedContract.title}</h2>
                <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                  <span>Contract ID: {selectedContract.id}</span>
                  <span className={getStatusColor(selectedContract.status)}>
                    Status: {getStatusText(selectedContract.status)}
                  </span>
                </div>
              </div>
              
              <p className="text-gray-300 mb-6 text-lg leading-relaxed">
                {selectedContract.description}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-3">
                  <p className="text-blue-400">
                    <span className="font-semibold">Required Skills:</span> {selectedContract.skills}
                  </p>
                  <p className="text-green-400">
                    <span className="font-semibold">Total Payment:</span> {selectedContract.totalPayment} APT
                  </p>
                  <p className="text-purple-400">
                    <span className="font-semibold">Milestones:</span> {selectedContract.milestones.length}
                  </p>
                </div>
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">
                    <span className="font-semibold">Created:</span> {new Date(selectedContract.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-gray-400 text-sm">
                    <span className="font-semibold">Client:</span> {formatWalletAddress(selectedContract.client)}
                  </p>
                  {selectedContract.freelancer && (
                    <p className="text-gray-400 text-sm">
                      <span className="font-semibold">Freelancer:</span> {formatWalletAddress(selectedContract.freelancer)}
                    </p>
                  )}
                  {selectedContract.acceptedAt && (
                    <p className="text-gray-400 text-sm">
                      <span className="font-semibold">Accepted:</span> {new Date(selectedContract.acceptedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Project Milestones</h3>
                <div className="space-y-4">
                  {selectedContract.milestones.map((milestone, index) => (
                    <div key={index} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h4 className="text-white font-semibold mb-1">
                            Milestone {index + 1}
                          </h4>
                          <p className="text-gray-300">{milestone.description}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-green-400 font-bold text-lg">
                            {milestone.amount} APT
                          </p>
                          <p className={`text-sm capitalize ${
                            milestone.status === 'paid' ? 'text-green-400' : 
                            milestone.status === 'completed' ? 'text-yellow-400' : 'text-gray-400'
                          }`}>
                            {milestone.status}
                          </p>
                        </div>
                      </div>

                      {/* Milestone Actions */}
                      <div className="flex gap-2 mt-3">
                        {/* Freelancer can mark as completed */}
                        {isFreelancer && selectedContract.status === 'accepted' && milestone.status === 'pending' && (
                          <button
                            onClick={() => markMilestoneCompleted(selectedContract.id, index)}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            Mark Completed
                          </button>
                        )}
                        
                        {/* Client can release payment */}
                        {isClient && milestone.status === 'completed' && (
                          <button
                            onClick={() => releasePayment(selectedContract.id, index)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
                          >
                            Release Payment
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 p-4 bg-gray-700 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Total Project Value:</span>
                    <span className="text-green-400 font-bold text-xl">
                      {selectedContract.totalPayment} APT
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-gray-400">
                      Paid: {selectedContract.milestones.filter(m => m.status === 'paid').length}/{selectedContract.milestones.length} milestones
                    </span>
                    <span className="text-gray-400">
                      {((selectedContract.milestones.filter(m => m.status === 'paid').length / selectedContract.milestones.length) * 100).toFixed(0)}% Complete
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Contract Actions */}
              <div className="flex gap-4">
                {selectedContract.status === 'pending' && !isClient && (
                  <>
                    <button
                      onClick={() => {
                        acceptContract(selectedContract.id);
                        navigateTo('freelancerDashboard');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors font-semibold"
                    >
                      Accept Contract
                    </button>
                    <button
                      onClick={() => {
                        skipContract(selectedContract.id);
                        navigateTo('freelancerDashboard');
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors"
                    >
                      Skip Contract
                    </button>
                  </>
                )}

                {selectedContract.status === 'accepted' && isClient && (
                  <div className="bg-blue-900 p-4 rounded-lg">
                    <p className="text-blue-300 text-sm">
                      Contract is in progress. Review and approve milestones as they are completed by the freelancer.
                    </p>
                  </div>
                )}

                {selectedContract.status === 'accepted' && isFreelancer && (
                  <div className="bg-yellow-900 p-4 rounded-lg">
                    <p className="text-yellow-300 text-sm">
                      Work on your milestones and mark them as completed when done. The client will review and release payments.
                    </p>
                  </div>
                )}

                {selectedContract.status === 'completed' && (
                  <div className="bg-green-900 p-4 rounded-lg">
                    <p className="text-green-300 text-sm">
                      🎉 Contract completed successfully! All milestones have been delivered and payments released.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Main App Component - Render current page
  const renderCurrentPage = (): React.ReactElement => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'clientDashboard':
        return <ClientDashboard />;
      case 'freelancerDashboard':
        return <FreelancerDashboard />;
      case 'createWork':
        return <CreateWorkPage />;
      case 'contractDetails':
        return <ContractDetailsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="App">
      {renderCurrentPage()}
    </div>
  );
};

export default EscrowApp;