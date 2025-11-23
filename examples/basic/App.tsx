/**
 * Basic Example - React App
 *
 * This file demonstrates using Lens with React hooks.
 */

import { LensProvider, useEntity, useList, useMutation } from "@lens/react";
import { api } from "./client";

/**
 * Main App component - wraps children with LensProvider
 */
export function App() {
	return (
		<LensProvider client={api}>
			<div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
				<h1>Lens Example App</h1>
				<UserProfile userId="1" />
				<hr />
				<PostList />
				<hr />
				<CreatePost />
			</div>
		</LensProvider>
	);
}

/**
 * User Profile Component
 *
 * Demonstrates:
 * - useEntity for single entity
 * - useMutation for updates
 * - Loading and error states
 */
function UserProfile({ userId }: { userId: string }) {
	const { data: user, loading, error } = useEntity("User", { id: userId });
	const { mutate: updateUser, loading: updating } = useMutation("User", "update");

	if (loading) return <div>Loading user...</div>;
	if (error) return <div>Error: {error.message}</div>;
	if (!user) return <div>User not found</div>;

	const handleNameChange = async () => {
		const newName = prompt("Enter new name:", user.name);
		if (newName && newName !== user.name) {
			await updateUser({ id: userId, name: newName });
		}
	};

	return (
		<div>
			<h2>User Profile</h2>
			<p>
				<strong>Name:</strong> {user.name}
				<button onClick={handleNameChange} disabled={updating} style={{ marginLeft: 10 }}>
					{updating ? "Updating..." : "Edit"}
				</button>
			</p>
			<p>
				<strong>Email:</strong> {user.email}
			</p>
			{user.avatar && (
				<p>
					<strong>Avatar:</strong> <img src={user.avatar} alt="avatar" width={50} />
				</p>
			)}
			<p>
				<strong>Posts:</strong> {user.posts.length}
			</p>
		</div>
	);
}

/**
 * Post List Component
 *
 * Demonstrates:
 * - useList for entity lists
 * - Filter and sort options
 */
function PostList() {
	const { data: posts, loading, refetch } = useList("Post", {
		where: { published: true },
		orderBy: { createdAt: "desc" },
	});

	if (loading) return <div>Loading posts...</div>;

	return (
		<div>
			<h2>
				Published Posts
				<button onClick={refetch} style={{ marginLeft: 10 }}>
					Refresh
				</button>
			</h2>
			{posts.length === 0 ? (
				<p>No posts yet.</p>
			) : (
				<ul>
					{posts.map((post) => (
						<li key={post.id}>
							<strong>{post.title}</strong>
							<p>{post.content}</p>
							<small>By {post.author.name}</small>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * Create Post Component
 *
 * Demonstrates:
 * - useMutation for create operations
 * - Optimistic updates
 */
function CreatePost() {
	const { mutate: createPost, loading, error, reset } = useMutation("Post", "create");

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);

		try {
			await createPost({
				title: formData.get("title") as string,
				content: formData.get("content") as string,
				published: true,
				authorId: "1",
			});
			form.reset();
			reset();
		} catch {
			// Error is captured in the hook
		}
	};

	return (
		<div>
			<h2>Create Post</h2>
			<form onSubmit={handleSubmit}>
				<div style={{ marginBottom: 10 }}>
					<input name="title" placeholder="Title" required style={{ width: "100%", padding: 8 }} />
				</div>
				<div style={{ marginBottom: 10 }}>
					<textarea name="content" placeholder="Content" required style={{ width: "100%", padding: 8, minHeight: 100 }} />
				</div>
				<button type="submit" disabled={loading}>
					{loading ? "Creating..." : "Create Post"}
				</button>
				{error && <p style={{ color: "red" }}>Error: {error.message}</p>}
			</form>
		</div>
	);
}

export default App;
