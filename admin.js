document.addEventListener('DOMContentLoaded', () => {

    // --- Authentication ---
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

// allow case-insensitive 'admin'
if (!currentUser || !currentUser.role || String(currentUser.role).toLowerCase() !== 'admin') {
  alert('Access Denied. Please log in as an Admin.');
  window.location.href = 'index.html';
  return;
}

    // --- DOM Elements ---
    const userListContainer = document.getElementById('user-list-container');
    const createAdminForm = document.getElementById('create-admin-form');
    const tabs = document.querySelectorAll('.admin-tab-btn');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    // --- Page Setup ---
    document.getElementById('admin-username').textContent = `Welcome, ${currentUser.username}`;
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });

    // --- Tab Switching ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;

            // Hide all content
            tabContents.forEach(content => content.classList.remove('active'));
            // Deactivate all tabs
            tabs.forEach(t => t.classList.remove('active'));

            // Show selected content and activate tab
            document.getElementById(tabId).classList.add('active');
            tab.classList.add('active');
        });
    });

    // --- Function to load and display all users ---
    function loadUsers() {
        userListContainer.innerHTML = ''; // Clear the current list
        
        const users = JSON.parse(localStorage.getItem('users')) || [];

        if (users.length === 0) {
            userListContainer.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
            return;
        }

        users.forEach((user, index) => {
            const userRow = `
                <tr>
                    <td>${user.username}</td>
                    <td>${user.password}</td> <td>${user.role}</td>
                    <td>
                        <button class="btn btn-danger remove-user-btn" data-index="${index}">Remove</button>
                    </td>
                </tr>
            `;
            userListContainer.insertAdjacentHTML('beforeend', userRow);
        });
    }

    // --- Handle clicks on the "Remove" button (Event Delegation) ---
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-user-btn')) {
            const userIndex = parseInt(e.target.dataset.index);
            
            if (confirm('Are you sure you want to remove this user? This action cannot be undone.')) {
                let users = JSON.parse(localStorage.getItem('users')) || [];
                const removedUser = users[userIndex];

                // Prevent admin from deleting themselves
                if (removedUser.username === currentUser.username) {
                    alert("You cannot remove your own account.");
                    return;
                }
                
                // Remove the user at the specified index
                users.splice(userIndex, 1);
                
                // Save the updated user list back to localStorage
                localStorage.setItem('users', JSON.stringify(users));
                
                // Refresh the table
                loadUsers();
            }
        }
    });

    // --- Handle "Create Admin" Form ---
    createAdminForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const username = document.getElementById('new-admin-username').value;
        const password = document.getElementById('new-admin-password').value;

        if (!username || !password) {
            alert('Please fill out all fields.');
            return;
        }

        let users = JSON.parse(localStorage.getItem('users'));

        // Check if user already exists
        if (users.find(u => u.username === username)) {
            alert('Username already exists.');
            return;
        }

        // Add the new admin user
        const newAdmin = {
            username: username,
            password: password,
            role: 'admin'
        };

        users.push(newAdmin);
        localStorage.setItem('users', JSON.stringify(users));

        alert(`Admin user '${username}' created successfully!`);
        createAdminForm.reset();

        // Refresh the user list in the other tab
        loadUsers();
    });

    // --- Initial load of the user list ---
    loadUsers();
});