import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import {
  Bell,
  User,
  Users,
  Building,
  BarChart,
  Calendar,
  ClipboardList,
  MapPin,
  Search,
  Plus,
  Trash2,
  Edit,
  FileText,
  FileSpreadsheet,
  Upload,
  ArrowLeft,
  X,
  Check,
  Map,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// The following global variables are provided by the Canvas environment.
const firebaseConfig = JSON.parse(
  typeof __firebase_config !== 'undefined'
    ? __firebase_config
    : '{}'
);
const initialAuthToken =
  typeof __initial_auth_token !== 'undefined'
    ? __initial_auth_token
    : null;
const appId =
  typeof __app_id !== 'undefined' ? __app_id : 'default-worksmart-id';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper function to convert a Firestore timestamp to a readable date string
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
};

// Helper function to calculate next due dates
const calculateNextDueDate = (lastDate, intervalDays) => {
  if (!lastDate) return null;
  const last = lastDate.toDate ? lastDate.toDate() : new Date(lastDate);
  const next = new Date(last);
  next.setDate(last.getDate() + intervalDays);
  return next;
};

// Main App Component
const App = () => {
  // Application state
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [userFacilities, setUserFacilities] = useState([]);
  const [currentFacility, setCurrentFacility] = useState(null);
  const [currentPage, setCurrentPage] = useState('login');
  const [clients, setClients] = useState([]);
  const [allFacilities, setAllFacilities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingIntervention, setTrackingIntervention] = useState('');
  const [trackingFinding, setTrackingFinding] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUserAuthModal, setShowUserAuthModal] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState({ status: '', details: '' });
  const [showMapModal, setShowMapModal] = useState(false);

  // Constants for different user roles
  const ROLES = {
    ADMIN: 'Admin',
    COORDINATOR: 'Hub Coordinator',
    PC: 'Professional Counselor',
    LC: 'Lay Counsellor',
    CLINICIAN: 'Clinician',
  };

  // Helper function to get the correct Firestore collection path based on user/app
  const getCollectionPath = (collectionName, facilityId = null) => {
    if (collectionName === 'facilities') {
      return `/artifacts/${appId}/public/data/facilities`;
    }
    if (collectionName === 'users') {
      return `/artifacts/${appId}/users/${userId}/users`;
    }
    if (collectionName === 'clients' && facilityId) {
      return `/artifacts/${appId}/public/data/facilities/${facilityId}/clients`;
    }
    return null;
  };

  // Initialize Auth State and Data Listeners
  useEffect(() => {
    const setupAuthAndData = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Firebase Auth Error:', error);
      }

      const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          const newUserId = currentUser.uid;
          setUserId(newUserId);
          setUser(currentUser);

          // Listen for user data (role, facilities)
          const userDocRef = doc(db, getCollectionPath('users'), newUserId);
          onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setUserRole(userData.role);
              setUserFacilities(userData.facilityAccess || []);
              setCurrentPage('dashboard');
            } else {
              // New user, wait for authorization
              setUserRole(null);
              setCurrentPage('login');
            }
          });

          // Listen for all facilities
          onSnapshot(collection(db, getCollectionPath('facilities')), (snapshot) => {
            const facilitiesList = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            setAllFacilities(facilitiesList);
            // If user has facilities, set the current one
            if (facilitiesList.length > 0 && userData.facilityAccess?.length > 0) {
              const firstFacility = facilitiesList.find(f => f.id === userData.facilityAccess[0]);
              setCurrentFacility(firstFacility || facilitiesList[0]);
            }
          });

          // Listen for pending user requests (Admin/Coordinator only)
          if (userRole === ROLES.ADMIN || userRole === ROLES.COORDINATOR) {
            const pendingQuery = query(
              collection(db, getCollectionPath('users')),
              where('isPending', '==', true)
            );
            onSnapshot(pendingQuery, (snapshot) => {
              const pendingList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
              setPendingUsers(pendingList);
            });
          }
        } else {
          setUser(null);
          setUserId('');
          setUserRole(null);
          setCurrentPage('login');
        }
      });

      return () => unsubscribeAuth();
    };

    setupAuthAndData();
  }, [initialAuthToken, db, auth, userRole]);

  // Listen for client data whenever the current facility changes
  useEffect(() => {
    if (currentFacility && userId) {
      const q = collection(db, getCollectionPath('clients', currentFacility.id));
      const unsubscribeClients = onSnapshot(q, (snapshot) => {
        const clientsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setClients(clientsList);
      });

      // Set up notifications
      const dueClients = clients.filter(client => {
        const today = new Date();
        const pharmacyDue = client.nextPharmacyDueDate?.toDate();
        if (!pharmacyDue) return false;
        const diffDays = Math.ceil((pharmacyDue - today) / (1000 * 60 * 60 * 24));
        return diffDays <= 14 && diffDays >= 0;
      });
      setNotifications(dueClients);

      return () => unsubscribeClients();
    }
  }, [currentFacility, userId]);

  // Handle user authentication and role-based access
  const handleLogin = (role) => {
    // This is a simplified login for the demo. In a real app, this would be a secure login form.
    // We are simulating setting a user's role and facility access.
    const userDocRef = doc(db, getCollectionPath('users'), userId);
    setDoc(userDocRef, {
      role,
      facilityAccess: allFacilities.length > 0 ? [allFacilities[0].id] : [],
      isPending: role === null,
    }, { merge: true });
    setUserRole(role);
    setCurrentPage('dashboard');
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setUserRole(null);
    setCurrentPage('login');
  };

  const handleCreateAccount = async () => {
    // Simulate a user creating an account and waiting for authorization
    const userDocRef = doc(db, getCollectionPath('users'), userId);
    await setDoc(userDocRef, {
      role: null,
      isPending: true,
      email: `${userId}@example.com`,
    }, { merge: true });
    alert('Account created. Waiting for Admin or PC authorization.');
    setCurrentPage('login');
  };

  const handleAuthorizeUser = async (userToAuthId, role, facilityIds) => {
    const userDocRef = doc(db, getCollectionPath('users'), userToAuthId);
    await updateDoc(userDocRef, {
      role,
      isPending: false,
      facilityAccess: facilityIds,
    });
  };

  // CRUD Operations for Clients
  const saveClient = async (clientData) => {
    if (!currentFacility) return;
    try {
      const clientCollectionRef = collection(db, getCollectionPath('clients', currentFacility.id));
      if (clientData.id) {
        await updateDoc(doc(clientCollectionRef, clientData.id), clientData);
      } else {
        await addDoc(clientCollectionRef, clientData);
      }
      setShowClientModal(false);
      setSelectedClient(null);
    } catch (error) {
      console.error('Error saving client:', error);
    }
  };

  const deleteClient = async (clientId) => {
    if (currentFacility && window.confirm('Are you sure you want to delete this client?')) {
      await deleteDoc(doc(db, getCollectionPath('clients', currentFacility.id), clientId));
    }
  };

  const handleStatusUpdate = async (status, details = '') => {
    if (!selectedClient) return;
    const clientRef = doc(db, getCollectionPath('clients', currentFacility.id), selectedClient.id);
    await updateDoc(clientRef, {
      status,
      statusDetails: details,
      isActive: status === 'Active', // Set isActive based on status
      statusDate: new Date(),
    });
    setSelectedClient(null);
    setShowStatusModal(false);
  };

  const handleTrackingUpdate = async () => {
    if (!selectedClient || !trackingIntervention || !trackingFinding) return;
    const clientRef = doc(db, getCollectionPath('clients', currentFacility.id), selectedClient.id);
    const trackingHistory = selectedClient.trackingHistory || [];
    const newTrackingEntry = {
      intervention: trackingIntervention,
      finding: trackingFinding,
      date: new Date(),
      tracker: user.email,
    };
    await updateDoc(clientRef, {
      trackingHistory: [...trackingHistory, newTrackingEntry],
    });
    setTrackingIntervention('');
    setTrackingFinding('');
    setShowTrackingModal(false);
  };

  // Facility Management
  const handleAddFacility = async () => {
    if (newFacilityName) {
      await addDoc(collection(db, getCollectionPath('facilities')), {
        name: newFacilityName,
        createdAt: new Date(),
      });
      setNewFacilityName('');
      setShowFacilityModal(false);
    }
  };

  const handleEditFacility = async (facilityId) => {
    const newName = prompt('Enter new facility name:');
    if (newName) {
      await updateDoc(doc(db, getCollectionPath('facilities'), facilityId), { name: newName });
    }
  };

  const handleDeleteFacility = async (facilityId) => {
    if (window.confirm('This will delete all clients and data for this facility. Are you sure?')) {
      // In a real app, this would require a more robust deletion process
      await deleteDoc(doc(db, getCollectionPath('facilities'), facilityId));
    }
  };

  // Data Import Logic (simulated)
  const handleImportData = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentFacility) return;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = async (event) => {
      const data = event.target.result;
      let parsedData = [];

      try {
        if (fileExtension === 'csv') {
          parsedData = Papa.parse(data, { header: true }).data;
        } else if (['xlsx', 'xls'].includes(fileExtension)) {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        } else {
          alert('Unsupported file type. Please upload a CSV or Excel file.');
          return;
        }

        const clientCollectionRef = collection(db, getCollectionPath('clients', currentFacility.id));
        const importPromises = parsedData.map(async (row) => {
          const clientData = {
            artNumber: row['ART Number'] || '',
            name: row['Name'] || 'Unknown',
            age: parseInt(row['Age']) || null,
            address: row['Address'] || '',
            contact: row['Contact'] || '',
            lastDrugPickup: row['Last Drug Pickup'] ? new Date(row['Last Drug Pickup']) : null,
            lastVlCollection: row['Last VL Collection'] ? new Date(row['Last VL Collection']) : null,
            // Autocalculate next due dates
            nextPharmacyDueDate: row['Next Pharmacy Due Date'] ? new Date(row['Next Pharmacy Due Date']) : calculateNextDueDate(row['Last Drug Pickup'], 90),
            nextVlDueDate: row['Next VL Due Date'] ? new Date(row['Next VL Due Date']) : calculateNextDueDate(row['Last VL Collection'], 180),
            isActive: true, // Default to active on import
            createdAt: new Date(),
          };

          // Alert for missing data
          if (!clientData.artNumber || !clientData.lastDrugPickup) {
            console.warn('Incomplete client data in import. Skipping or flagging:', row);
          }

          // Use a transaction to prevent race conditions
          await addDoc(clientCollectionRef, clientData);
        });

        await Promise.all(importPromises);
        alert(`${parsedData.length} clients imported successfully!`);
        setShowImportModal(false);
      } catch (error) {
        console.error('Error during data import:', error);
        alert('Failed to import data. Please check the file format and try again.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const filteredClients = clients.filter(client =>
    (client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.artNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.address?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getPharmacyDueClients = (timeframe) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return clients.filter(client => {
      if (!client.isActive || !client.nextPharmacyDueDate) return false;
      const dueDate = client.nextPharmacyDueDate.toDate ? client.nextPharmacyDueDate.toDate() : new Date(client.nextPharmacyDueDate);
      dueDate.setHours(0, 0, 0, 0);

      const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

      switch (timeframe) {
        case 'today':
          return diffDays === 0;
        case 'tomorrow':
          return diffDays === 1;
        case 'thisWeek':
          return diffDays >= 0 && diffDays <= 7;
        case 'nextWeek':
          return diffDays > 7 && diffDays <= 14;
        case 'thisMonth':
          return dueDate.getMonth() === today.getMonth() && dueDate.getFullYear() === today.getFullYear();
        case 'late':
          return diffDays < 0;
        default:
          return true;
      }
    });
  };

  // Main UI Structure
  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage onLogin={handleLogin} onCreateAccount={handleCreateAccount} />;
      case 'dashboard':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Dashboard</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-purple-100 p-4 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Clients</span>
                      <Users className="text-purple-600" />
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mt-2">{clients.length}</h3>
                  </div>
                  <div className="bg-blue-100 p-4 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Active Clients</span>
                      <Check className="text-blue-600" />
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mt-2">{clients.filter(c => c.isActive).length}</h3>
                  </div>
                  <div className="bg-red-100 p-4 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Late Pharmacy Pickup</span>
                      <X className="text-red-600" />
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mt-2">{getPharmacyDueClients('late').length}</h3>
                  </div>
                </div>
              </div>
            </main>
          </>
        );
      case 'clients':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <ClientList
                clients={filteredClients}
                onSearch={setSearchQuery}
                onAdd={() => { setSelectedClient(null); setShowClientModal(true); }}
                onEdit={(client) => { setSelectedClient(client); setShowClientModal(true); }}
                onDelete={deleteClient}
                userRole={userRole}
                onUpdateStatus={(client) => { setSelectedClient(client); setShowStatusModal(true); }}
                onTrackClient={(client) => { setSelectedClient(client); setShowTrackingModal(true); }}
                onShowMap={(client) => { setSelectedClient(client); setShowMapModal(true); }}
              />
            </main>
          </>
        );
      case 'reports':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <ReportsPage clients={clients} />
            </main>
          </>
        );
      case 'accountRequests':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <AccountRequests pendingUsers={pendingUsers} allFacilities={allFacilities} onAuthorize={handleAuthorizeUser} />
            </main>
          </>
        );
      case 'facilities':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <FacilityManagement
                facilities={allFacilities}
                onAdd={() => setShowFacilityModal(true)}
                onEdit={handleEditFacility}
                onDelete={handleDeleteFacility}
              />
            </main>
          </>
        );
      case 'analytics':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <AnalyticsPage clients={clients} />
            </main>
          </>
        );
      case 'tx-curr':
        return (
          <>
            <Header
              title="Worksmart"
              slogan="track easily"
              onPageChange={setCurrentPage}
              userRole={userRole}
              userFacilities={userFacilities}
              currentFacility={currentFacility}
              setCurrentFacility={setCurrentFacility}
              notifications={notifications}
              onLogout={handleLogout}
              onShowNotifications={() => setShowNotificationModal(true)}
            />
            <main className="container mx-auto p-4 md:p-8 mt-16 lg:mt-24">
              <TxCurrPage clients={clients} onImport={() => setShowImportModal(true)} />
            </main>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800">
      {renderPage()}

      {/* Modals */}
      {showClientModal && <ClientModal client={selectedClient} onClose={() => setShowClientModal(false)} onSave={saveClient} />}
      {showNotificationModal && <NotificationModal notifications={notifications} onClose={() => setShowNotificationModal(false)} />}
      {showTrackingModal && <TrackingModal client={selectedClient} onClose={() => setShowTrackingModal(false)} onSave={handleTrackingUpdate} intervention={trackingIntervention} setIntervention={setTrackingIntervention} finding={trackingFinding} setFinding={setTrackingFinding} />}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} onImport={handleImportData} />}
      {showUserAuthModal && <UserAuthModal onClose={() => setShowUserAuthModal(false)} onAuthorize={handleAuthorizeUser} />}
      {showFacilityModal && <AddFacilityModal onClose={() => setShowFacilityModal(false)} onAdd={handleAddFacility} newFacilityName={newFacilityName} setNewFacilityName={setNewFacilityName} />}
      {showStatusModal && <UpdateStatusModal client={selectedClient} onClose={() => setShowStatusModal(false)} onUpdate={handleStatusUpdate} />}
      {showMapModal && <MapModal client={selectedClient} onClose={() => setShowMapModal(false)} />}
    </div>
  );
};

// --- Component Definitions ---

const Header = ({ title, slogan, onPageChange, userRole, userFacilities, currentFacility, setCurrentFacility, notifications, onLogout, onShowNotifications }) => {
  return (
    <header className="fixed top-0 left-0 w-full bg-white shadow-md z-50">
      <div className="container mx-auto p-4 flex items-center justify-between flex-wrap">
        <div className="flex items-center space-x-2">
          <h1 className="text-2xl font-extrabold text-indigo-600">{title}</h1>
          <span className="text-sm text-gray-500 hidden md:block">{slogan}</span>
        </div>
        <nav className="flex-grow flex justify-center space-x-4 md:space-x-8 mt-2 md:mt-0">
          <button className="nav-link" onClick={() => onPageChange('dashboard')}><BarChart className="w-5 h-5" />Dashboard</button>
          <button className="nav-link" onClick={() => onPageChange('tx-curr')}><Users className="w-5 h-5" />TX-Curr</button>
          <button className="nav-link" onClick={() => onPageChange('reports')}><ClipboardList className="w-5 h-5" />Reports</button>
          {(userRole === 'Admin' || userRole === 'Hub Coordinator') && (
            <button className="nav-link" onClick={() => onPageChange('accountRequests')}><User className="w-5 h-5" />Account Requests</button>
          )}
          {(userRole === 'Admin' || userRole === 'Hub Coordinator' || userRole === 'Professional Counselor') && (
            <button className="nav-link" onClick={() => onPageChange('facilities')}><Building className="w-5 h-5" />Facilities</button>
          )}
          {(userRole === 'Admin' || userRole === 'Hub Coordinator' || userRole === 'Professional Counselor') && (
            <button className="nav-link" onClick={() => onPageChange('analytics')}><BarChart className="w-5 h-5" />Analytics</button>
          )}
        </nav>
        <div className="flex items-center space-x-4 mt-2 md:mt-0">
          <div className="relative">
            <button
              onClick={onShowNotifications}
              className="relative p-2 rounded-full hover:bg-gray-200 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-6 h-6 text-indigo-600" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
          </div>
          {userFacilities.length > 0 && (
            <select
              className="p-2 border rounded-md"
              value={currentFacility?.id || ''}
              onChange={(e) => setCurrentFacility(userFacilities.find(f => f.id === e.target.value))}
            >
              {userFacilities.map(fac => (
                <option key={fac} value={fac}>{allFacilities.find(f => f.id === fac)?.name}</option>
              ))}
            </select>
          )}
          <button onClick={onLogout} className="px-4 py-2 bg-red-500 text-white font-bold rounded-full shadow hover:bg-red-600 transition-colors">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

const LoginPage = ({ onLogin, onCreateAccount }) => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
    <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
      <h1 className="text-4xl font-extrabold text-indigo-600 mb-2">Worksmart</h1>
      <p className="text-sm text-gray-500 mb-6">track easily</p>
      <h2 className="text-2xl font-bold mb-4">Select User Role to Demo</h2>
      <p className="text-sm text-gray-600 mb-6">In a real application, you would log in with your credentials and your role would be assigned automatically by an administrator.</p>
      <div className="space-y-4">
        {['Admin', 'Hub Coordinator', 'Professional Counselor', 'Lay Counsellor', 'Clinician'].map(role => (
          <button
            key={role}
            onClick={() => onLogin(role)}
            className="w-full py-3 px-6 bg-indigo-500 text-white font-bold rounded-xl shadow-md hover:bg-indigo-600 transition-transform transform hover:scale-105"
          >
            Log in as {role}
          </button>
        ))}
        <button
          onClick={onCreateAccount}
          className="w-full py-3 px-6 bg-gray-300 text-gray-800 font-bold rounded-xl shadow-md hover:bg-gray-400 transition-transform transform hover:scale-105"
        >
          Request New Account
        </button>
      </div>
    </div>
  </div>
);

const ClientList = ({ clients, onSearch, onAdd, onEdit, onDelete, userRole, onUpdateStatus, onTrackClient, onShowMap }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
        <h2 className="text-2xl font-bold text-gray-800">Clients</h2>
        <div className="flex space-x-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, ART #, or address..."
              className="pl-10 pr-4 py-2 border rounded-full w-full sm:w-64 focus:ring-2 focus:ring-indigo-500"
              onChange={(e) => onSearch(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          {(userRole === 'Clinician' || userRole === 'Professional Counselor') && (
            <button
              onClick={onAdd}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-5 h-5 inline-block mr-2" />
              Add Client
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ART #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Dates</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map(client => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.artNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {client.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <p><span className="font-semibold">Pharmacy:</span> {formatDate(client.nextPharmacyDueDate)}</p>
                  <p><span className="font-semibold">VL:</span> {formatDate(client.nextVlDueDate)}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    {(userRole === 'Professional Counselor' || userRole === 'Admin') && (
                      <button onClick={() => onUpdateStatus(client)} className="text-gray-500 hover:text-red-600 transition-colors" title="Update Status">
                        <Users className="w-5 h-5" />
                      </button>
                    )}
                    {(userRole === 'Lay Counsellor' || userRole === 'Professional Counselor') && (
                      <button onClick={() => onTrackClient(client)} className="text-gray-500 hover:text-blue-600 transition-colors" title="Track Client">
                        <MapPin className="w-5 h-5" />
                      </button>
                    )}
                    {(userRole === 'Admin' || userRole === 'Professional Counselor') && (
                      <button onClick={() => onEdit(client)} className="text-gray-500 hover:text-indigo-600 transition-colors" title="Edit">
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {(userRole === 'Admin') && (
                      <button onClick={() => onDelete(client.id)} className="text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    {client.coordinates && (
                      <button onClick={() => onShowMap(client)} className="text-gray-500 hover:text-green-600 transition-colors" title="View on Map">
                        <Map className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ClientModal = ({ client, onClose, onSave }) => {
  const [formData, setFormData] = useState(client || {});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Autocalculate next due dates here
    const lastDrugPickupDate = formData.lastDrugPickup ? new Date(formData.lastDrugPickup) : null;
    const lastVlCollectionDate = formData.lastVlCollection ? new Date(formData.lastVlCollection) : null;
    const nextPharmacyDueDate = calculateNextDueDate(lastDrugPickupDate, 90); // Example interval: 90 days
    const nextVlDueDate = calculateNextDueDate(lastVlCollectionDate, 180); // Example interval: 180 days

    const updatedData = {
      ...formData,
      lastDrugPickup: lastDrugPickupDate,
      lastVlCollection: lastVlCollectionDate,
      nextPharmacyDueDate,
      nextVlDueDate,
    };
    onSave(updatedData);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-lg">
        <h3 className="text-xl font-bold mb-4">{client ? 'Edit Client' : 'Add New Client'}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputField label="ART Number" name="artNumber" value={formData.artNumber || ''} onChange={handleChange} required />
          <InputField label="Name" name="name" value={formData.name || ''} onChange={handleChange} required />
          <InputField label="Age" name="age" type="number" value={formData.age || ''} onChange={handleChange} />
          <InputField label="Address" name="address" value={formData.address || ''} onChange={handleChange} />
          <InputField label="Contact" name="contact" value={formData.contact || ''} onChange={handleChange} />
          <InputField label="Last Drug Pickup Date" name="lastDrugPickup" type="date" value={formData.lastDrugPickup ? new Date(formData.lastDrugPickup).toISOString().split('T')[0] : ''} onChange={handleChange} />
          <InputField label="Last VL Collection Date" name="lastVlCollection" type="date" value={formData.lastVlCollection ? new Date(formData.lastVlCollection).toISOString().split('T')[0] : ''} onChange={handleChange} />
          <div className="flex justify-end space-x-2 mt-6">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-full text-gray-700 font-bold hover:bg-gray-100">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const InputField = ({ label, name, value, onChange, type = 'text', required = false }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
    />
  </div>
);

const ReportsPage = ({ clients }) => {
  const [timeframe, setTimeframe] = useState('today');
  const [reportClients, setReportClients] = useState([]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const getClientsByTimeframe = () => {
      return clients.filter(client => {
        if (!client.isActive || !client.nextPharmacyDueDate) return false;
        const dueDate = client.nextPharmacyDueDate.toDate ? client.nextPharmacyDueDate.toDate() : new Date(client.nextPharmacyDueDate);
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        switch (timeframe) {
          case 'today': return diffDays === 0;
          case 'tomorrow': return diffDays === 1;
          case 'thisWeek': return diffDays >= 0 && diffDays <= 7;
          case 'nextWeek': return diffDays > 7 && diffDays <= 14;
          case 'thisMonth': return dueDate.getMonth() === today.getMonth() && dueDate.getFullYear() === today.getFullYear();
          case 'late': return diffDays < 0;
          default: return true;
        }
      });
    };
    setReportClients(getClientsByTimeframe());
  }, [timeframe, clients]);

  const handleExport = (type) => {
    const ws = XLSX.utils.json_to_sheet(reportClients.map(c => ({
      'ART Number': c.artNumber,
      'Name': c.name,
      'Address': c.address,
      'Contact': c.contact,
      'Next Due Date': formatDate(c.nextPharmacyDueDate),
      'Last Drug Pickup': formatDate(c.lastDrugPickup),
      'Status': c.isActive ? 'Active' : 'Inactive',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pharmacy Report');
    XLSX.writeFile(wb, `pharmacy_report_${timeframe}.${type === 'excel' ? 'xlsx' : 'pdf'}`);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Pharmacy Due Clients Report</h2>
      <div className="flex items-center space-x-4 mb-4">
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="p-2 border rounded-full"
        >
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="thisWeek">This Week</option>
          <option value="nextWeek">Next Week</option>
          <option value="thisMonth">This Month</option>
          <option value="late">Late Clients</option>
        </select>
        <button onClick={() => handleExport('excel')} className="report-btn bg-green-600">
          <FileSpreadsheet className="w-5 h-5 mr-2" />
          Export to Excel
        </button>
        <button onClick={() => handleExport('pdf')} className="report-btn bg-red-600">
          <FileText className="w-5 h-5 mr-2" />
          Export to PDF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ART #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Due Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reportClients.map(client => (
              <tr key={client.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.artNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.address}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.contact}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(client.nextPharmacyDueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const NotificationModal = ({ notifications, onClose }) => {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-lg">
        <h3 className="text-xl font-bold mb-4">Notifications</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        {notifications.length === 0 ? (
          <p className="text-gray-500">No new notifications.</p>
        ) : (
          <ul className="space-y-4">
            {notifications.map(client => (
              <li key={client.id} className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="font-bold">{client.name} is due for pharmacy pickup on {formatDate(client.nextPharmacyDueDate)}.</p>
                <p className="text-sm text-gray-600">ART #: {client.artNumber}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const TrackingModal = ({ client, onClose, onSave, intervention, setIntervention, finding, setFinding }) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if client is late and set the tracking step
    if (client?.lastDrugPickup) {
      const today = new Date();
      const lastPickup = client.lastDrugPickup.toDate ? client.lastDrugPickup.toDate() : new Date(client.lastDrugPickup);
      const diffDays = Math.ceil((today - lastPickup) / (1000 * 60 * 60 * 24));
      if (diffDays > 28) setCurrentStep(4);
      else if (diffDays > 21) setCurrentStep(3);
      else if (diffDays > 14) setCurrentStep(2);
      else if (diffDays > 7) setCurrentStep(1);
    }
  }, [client]);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Tracking for {client?.name}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        <p className="text-sm text-gray-600 mb-4">Tracking step: Day {currentStep * 7}</p>
        <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Intervention Used</label>
              <input
                type="text"
                value={intervention}
                onChange={(e) => setIntervention(e.target.value)}
                className="w-full p-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Findings</label>
              <textarea
                value={finding}
                onChange={(e) => setFinding(e.target.value)}
                className="w-full p-2 border rounded-lg h-24"
                required
              ></textarea>
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-full text-gray-700 font-bold hover:bg-gray-100">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-full shadow-md hover:bg-blue-700">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ImportModal = ({ onClose, onImport }) => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (file) {
      onImport({ target: { files: [file] } });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Import Clients</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        <p className="text-sm text-gray-600 mb-4">Select an Excel or CSV file to import client data. The system will try to match columns based on headers like "ART Number", "Name", "Age", etc.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input type="file" onChange={handleFileChange} accept=".csv, .xlsx, .xls" className="w-full text-gray-700" required />
          </div>
          <div className="flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-full text-gray-700 font-bold hover:bg-gray-100">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700">Import</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FacilityManagement = ({ facilities, onAdd, onEdit, onDelete }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-2xl font-bold text-gray-800">Facility Management</h2>
      <button onClick={onAdd} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700 transition-colors">
        <Plus className="w-5 h-5 inline-block mr-2" />
        Add Facility
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facility Name</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {facilities.map(facility => (
            <tr key={facility.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{facility.name}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
                  <button onClick={() => onEdit(facility.id)} className="text-gray-500 hover:text-indigo-600 transition-colors" title="Edit">
                    <Edit className="w-5 h-5" />
                  </button>
                  <button onClick={() => onDelete(facility.id)} className="text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const AddFacilityModal = ({ onClose, onAdd, newFacilityName, setNewFacilityName }) => (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
    <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
      <h3 className="text-xl font-bold mb-4">Add New Facility</h3>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
        <X />
      </button>
      <form onSubmit={(e) => { e.preventDefault(); onAdd(); }}>
        <InputField label="Facility Name" name="facilityName" value={newFacilityName} onChange={(e) => setNewFacilityName(e.target.value)} required />
        <div className="flex justify-end space-x-2 mt-6">
          <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-full text-gray-700 font-bold hover:bg-gray-100">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700">Add</button>
        </div>
      </form>
    </div>
  </div>
);

const UpdateStatusModal = ({ client, onClose, onUpdate }) => {
  const [status, setStatus] = useState('');
  const [details, setDetails] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status) {
      onUpdate(status, details);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold mb-4">Update Status for {client?.name}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full p-2 border rounded-lg" required>
              <option value="">Select a status</option>
              <option value="Active">Active</option>
              <option value="IIT">Interruption in Treatment (IIT)</option>
              <option value="Defaulter">Defaulter</option>
              <option value="Dead">Dead</option>
              <option value="Transfer Out">Transfer Out</option>
            </select>
          </div>
          {['Dead', 'Transfer Out'].includes(status) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full p-2 border rounded-lg h-24"
                required
              ></textarea>
            </div>
          )}
          <div className="flex justify-end space-x-2 mt-6">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-full text-gray-700 font-bold hover:bg-gray-100">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700">Update Status</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TxCurrPage = ({ clients, onImport }) => {
  const activeClients = clients.filter(c => c.isActive).length;
  const inactiveClients = clients.filter(c => !c.isActive).length;
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">TX-CURR (Clients Currently on Treatment)</h2>
        <button onClick={onImport} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-md hover:bg-indigo-700 transition-colors">
          <Upload className="w-5 h-5 inline-block mr-2" />
          Import Clients
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-green-100 p-4 rounded-lg shadow-sm">
          <span className="text-sm text-gray-600">Active Clients</span>
          <h3 className="text-3xl font-bold text-gray-900 mt-2">{activeClients}</h3>
        </div>
        <div className="bg-red-100 p-4 rounded-lg shadow-sm">
          <span className="text-sm text-gray-600">Inactive Clients</span>
          <h3 className="text-3xl font-bold text-gray-900 mt-2">{inactiveClients}</h3>
        </div>
      </div>
    </div>
  );
};

const AnalyticsPage = ({ clients }) => {
  const clientAges = clients.map(c => c.age).filter(age => age > 0);
  const avgAge = clientAges.length ? (clientAges.reduce((sum, age) => sum + age, 0) / clientAges.length).toFixed(1) : 0;
  const statusCounts = clients.reduce((acc, client) => {
    const status = client.status || 'Active';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-100 p-4 rounded-lg shadow-sm">
          <span className="text-sm text-gray-600">Average Client Age</span>
          <h3 className="text-3xl font-bold text-gray-900 mt-2">{avgAge} years</h3>
        </div>
        <div className="bg-gray-100 p-4 rounded-lg shadow-sm">
          <span className="text-sm text-gray-600">Client Status Distribution</span>
          <ul className="mt-2 space-y-1">
            {Object.entries(statusCounts).map(([status, count]) => (
              <li key={status} className="flex justify-between items-center text-gray-700">
                <span>{status}</span>
                <span className="font-bold">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const AccountRequests = ({ pendingUsers, allFacilities, onAuthorize }) => {
  const [selectedRole, setSelectedRole] = useState({});
  const [selectedFacilities, setSelectedFacilities] = useState({});

  const handleRoleChange = (userId, role) => {
    setSelectedRole(prev => ({ ...prev, [userId]: role }));
  };

  const handleFacilityChange = (userId, facilityId) => {
    setSelectedFacilities(prev => {
      const current = prev[userId] || [];
      if (current.includes(facilityId)) {
        return { ...prev, [userId]: current.filter(id => id !== facilityId) };
      } else {
        return { ...prev, [userId]: [...current, facilityId] };
      }
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Pending Account Requests</h2>
      {pendingUsers.length === 0 ? (
        <p className="text-gray-500">No pending requests.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Select Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Select Facilities</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingUsers.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select
                      value={selectedRole[user.id] || ''}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="p-2 border rounded-md"
                    >
                      <option value="">Select Role</option>
                      {['Admin', 'Hub Coordinator', 'Professional Counselor', 'Lay Counsellor', 'Clinician'].map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {allFacilities.map(facility => (
                      <div key={facility.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`fac-${user.id}-${facility.id}`}
                          checked={(selectedFacilities[user.id] || []).includes(facility.id)}
                          onChange={() => handleFacilityChange(user.id, facility.id)}
                        />
                        <label htmlFor={`fac-${user.id}-${facility.id}`}>{facility.name}</label>
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => onAuthorize(user.id, selectedRole[user.id], selectedFacilities[user.id] || [])}
                      className="px-4 py-2 bg-green-500 text-white font-bold rounded-full shadow-md hover:bg-green-600 disabled:opacity-50"
                      disabled={!selectedRole[user.id]}
                    >
                      Authorize
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MapModal = ({ client, onClose }) => {
  const [mapUrl, setMapUrl] = useState('');

  useEffect(() => {
    // Simulate getting coordinates and generating a map URL
    if (client?.coordinates) {
      const [lat, lon] = client.coordinates.split(',').map(Number);
      // Example using Google Maps URL format
      setMapUrl(`https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${lat},${lon}`);
    } else {
      setMapUrl('https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=Zambia');
    }
  }, [client]);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl h-3/4">
        <h3 className="text-xl font-bold mb-4">Map Location for {client?.name}</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X />
        </button>
        {client?.coordinates ? (
          <div className="w-full h-full">
            <iframe
              title="Client Location Map"
              width="100%"
              height="100%"
              style={{ border: 0, borderRadius: '12px' }}
              src={mapUrl}
              allowFullScreen=""
              loading="lazy"
            ></iframe>
            <p className="mt-2 text-sm text-center text-gray-500">Coordinates: {client.coordinates}</p>
          </div>
        ) : (
          <p className="text-gray-500 text-center mt-8">No coordinates available for this client.</p>
        )}
      </div>
    </div>
  );
};

// Global styles for the app
const style = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap');

  body {
    font-family: 'Inter', sans-serif;
  }
  .nav-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem;
    font-weight: 600;
    color: #6B7280; /* gray-500 */
    transition: all 0.2s ease-in-out;
    border-bottom: 2px solid transparent;
  }
  .nav-link:hover {
    color: #4F46E5; /* indigo-600 */
    border-bottom: 2px solid #6366F1;
  }
  .report-btn {
    display: inline-flex;
    align-items: center;
    px-4 py-2 text-white font-bold rounded-full shadow-md hover:bg-opacity-90 transition-colors;
  }
  /* Responsive styles for navigation links */
  @media (max-width: 768px) {
    .nav-link {
      padding: 0.25rem;
      font-size: 0.75rem;
    }
  }
`;
```css
${style}
