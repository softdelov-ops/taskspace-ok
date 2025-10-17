import React from "react";
import { AuthProvider } from "./auth/AuthProvider";
import SignIn from "./auth/SignIn";
import Profile from "./auth/Profile";
import TaskList from "./tasks/TaskList";

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <h1>TaskSpace</h1>
        <SignIn />
        <Profile />
        <TaskList />
      </div>
    </AuthProvider>
  );
}
