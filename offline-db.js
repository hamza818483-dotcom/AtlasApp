// ATLAS APP - IndexedDB Offline Storage
const DB_NAME = 'atlas_offline_db';
const DB_VERSION = 1;

class OfflineDB {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB connected');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for offline exam results
        if (!db.objectStoreNames.contains('offline_exams')) {
          const examStore = db.createObjectStore('offline_exams', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          examStore.createIndex('timestamp', 'timestamp');
          examStore.createIndex('synced', 'synced');
        }
        
        // Store for pending mistakes
        if (!db.objectStoreNames.contains('pending_mistakes')) {
          const mistakeStore = db.createObjectStore('pending_mistakes', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          mistakeStore.createIndex('timestamp', 'timestamp');
        }
        
        // Store for offline questions
        if (!db.objectStoreNames.contains('offline_questions')) {
          const questionStore = db.createObjectStore('offline_questions', { 
            keyPath: 'exam_id' 
          });
          questionStore.createIndex('exam_id', 'exam_id');
        }
        
        // Store for user data cache
        if (!db.objectStoreNames.contains('user_cache')) {
          const userStore = db.createObjectStore('user_cache', { 
            keyPath: 'phone' 
          });
          userStore.createIndex('phone', 'phone');
        }
      };
    });
  }

  async saveExamOffline(examData) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_exams'], 'readwrite');
      const store = transaction.objectStore('offline_exams');
      
      const record = {
        ...examData,
        timestamp: Date.now(),
        synced: false
      };
      
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedExams() {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_exams'], 'readonly');
      const store = transaction.objectStore('offline_exams');
      const index = store.index('synced');
      const request = index.getAll(false);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markExamAsSynced(id) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_exams'], 'readwrite');
      const store = transaction.objectStore('offline_exams');
      const request = store.get(id);
      
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.synced = true;
          const updateRequest = store.put(data);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveMistakeOffline(mistakeData) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pending_mistakes'], 'readwrite');
      const store = transaction.objectStore('pending_mistakes');
      
      const record = {
        ...mistakeData,
        timestamp: Date.now()
      };
      
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async cacheQuestions(examId, questions) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_questions'], 'readwrite');
      const store = transaction.objectStore('offline_questions');
      
      const request = store.put({
        exam_id: examId,
        questions: questions,
        cached_at: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedQuestions(examId) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['offline_questions'], 'readonly');
      const store = transaction.objectStore('offline_questions');
      const request = store.get(examId);
      
      request.onsuccess = () => resolve(request.result?.questions || null);
      request.onerror = () => reject(request.error);
    });
  }

  async cacheUserData(user) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['user_cache'], 'readwrite');
      const store = transaction.objectStore('user_cache');
      
      const request = store.put({
        phone: user.phone,
        data: user,
        cached_at: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedUser(phone) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['user_cache'], 'readonly');
      const store = transaction.objectStore('user_cache');
      const request = store.get(phone);
      
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  async syncPendingExams() {
    const unsynced = await this.getUnsyncedExams();
    
    for (const exam of unsynced) {
      try {
        const response = await fetch('/api/exam_results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exam)
        });
        
        if (response.ok) {
          await this.markExamAsSynced(exam.id);
          console.log('Synced exam:', exam.id);
        }
      } catch (error) {
        console.error('Sync failed for exam:', exam.id, error);
      }
    }
  }

  async ensureDB() {
    if (this.db) return this.db;
    await this.init();
    return this.db;
  }
}

// Create global instance
window.offlineDB = new OfflineDB();
window.idb = window.offlineDB; // Alias for compatibility