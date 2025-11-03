import mongoose from "mongoose";
import Task from "../Models/Task.js";
import Client from "../Models/Client.js";
import SubCompany from "../Models/SubCompany.js";
import User from "../Models/userSchema.js";
import TaskAssignment from "../Models/TaskAssignment.js"; 
 
export const addTask = async (req, res) => {
  try {
    const {
      title,
      description,
      client,
      subCompany,
      chosenServices,
      assignedTo,
      priority,
      status,
      deadline,
      attachments,
      comments,
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    if (!client) {
      return res.status(400).json({ success: false, message: "Client is required" });
    }

    // ✅ Validate client and subCompany IDs
    const validateId = (id, name) => {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name} ID`);
      }
    };
    validateId(client, "client");
    validateId(subCompany, "subCompany");

    // ✅ Validate chosenServices
    if (chosenServices && !Array.isArray(chosenServices)) {
      return res.status(400).json({ success: false, message: "chosenServices must be an array" });
    }

    // ✅ Validate assignedTo
    if (assignedTo && !Array.isArray(assignedTo)) {
      return res.status(400).json({ success: false, message: "assignedTo must be an array" });
    }

    if (assignedTo && assignedTo.length > 0) {
      for (const userId of assignedTo) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ success: false, message: `Invalid user ID: ${userId}` });
        }
        const exists = await User.findById(userId);
        if (!exists) {
          return res.status(404).json({ success: false, message: `User not found: ${userId}` });
        }
      }
    }

    // 🆕 Create task with chosenServices
    const task = await Task.create({
      title,
      description,
      client,
      subCompany,
      chosenServices: chosenServices || [],
      createdBy: req.user?._id || null,
      assignedTo: assignedTo || [],
      priority: priority || "medium",
      status: status || "open",
      deadline,
      attachments: attachments || [],
      comments: comments || [],
      logs: [
        {
          action: "Task created",
          by: req.user?._id || null,
          at: new Date(),
        },
      ],
    });

    // 🆕 Create TaskAssignment records for each assigned user
    if (assignedTo && assignedTo.length > 0) {
      const assignments = assignedTo.map(userId => ({
        task: task._id,
        user: userId,
        status: "not_started",
        logs: [
          {
            action: "Task assigned",
            by: req.user?._id || null,
            at: new Date(),
          },
        ],
      }));
      await TaskAssignment.insertMany(assignments);
    }

    // Populate the task with client details
    const populatedTask = await Task.findById(task._id)
      .populate('client', 'name email phone businessName meta')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email');

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: populatedTask,
    });
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      client,
      subCompany,
      chosenServices,
      assignedTo,
      priority,
      status,
      deadline,
      attachments,
      comments,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID" });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // Update task fields
    const updateData = {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(client && { client }),
      ...(subCompany !== undefined && { subCompany }),
      ...(chosenServices !== undefined && { chosenServices }),
      ...(assignedTo !== undefined && { assignedTo }),
      ...(priority && { priority }),
      ...(status && { status }),
      ...(deadline !== undefined && { deadline }),
      ...(attachments !== undefined && { attachments }),
    };

    // Add update log
    const updateLog = {
      action: "Task updated",
      by: req.user?._id || null,
      at: new Date(),
      extra: {
        updatedFields: Object.keys(updateData)
      }
    };

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      {
        ...updateData,
        $push: { logs: updateLog }
      },
      { new: true, runValidators: true }
    )
      .populate('client', 'name email phone businessName meta')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email');

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: updatedTask,
    });
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid task ID" });

    const task = await Task.findById(id);
    if (!task)
      return res.status(404).json({ success: false, message: "Task not found" });

    await task.deleteOne();
    res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllTasks = async (req, res) => {
  try {
    const { status, priority, assignedTo, client, subCompany, search, limit, view } = req.query;
    const filter = {};

    // 🧠 Handle "me" keyword - IMPORTANT FIX
    if (assignedTo) {
      if (assignedTo === "me") {
        filter.assignedTo = req.user._id;
      } else if (mongoose.Types.ObjectId.isValid(assignedTo)) {
        filter.assignedTo = assignedTo;
      } else {
        return res.status(400).json({ success: false, message: "Invalid assignedTo parameter" });
      }
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (client) filter.client = client;
    if (subCompany) filter.subCompany = subCompany;
    if (search) filter.title = { $regex: search, $options: "i" };

    let query = Task.find(filter)
      .populate("client", "name clientId")
      .populate("subCompany", "name")
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });


      
    // Optional: add limit
    if (limit) query = query.limit(Number(limit));

    const tasks = await query;

    // 🆕 ENHANCEMENT: If user is requesting their own tasks, include assignment data
    let enhancedTasks = await Promise.all(
  tasks.map(async (task) => {
    const assignments = await TaskAssignment.find({ task: task._id })
      .populate("user", "fullName email avatarUrl");

    const taskObj = task.toObject();
    taskObj.assignments = assignments;
    return taskObj;
  })
);
    
    if (assignedTo === "me" || req.query.includeAssignment === "true") {
      enhancedTasks = await Promise.all(
        tasks.map(async (task) => {
          const assignment = await TaskAssignment.findOne({
            task: task._id,
            user: req.user._id
          });
          
          // Convert to plain object to add assignment data
          const taskObj = task.toObject();
          taskObj.assignment = assignment;
          taskObj.progress = assignment?.progress || 0;
          taskObj.userStatus = assignment?.status || 'not_started';
          
          return taskObj;
        })
      );
    }

    res.status(200).json({
      success: true,
      count: enhancedTasks.length,
      data: enhancedTasks,
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid task ID" });

    const task = await Task.findById(id)
      .populate("client", "name")
      .populate("subCompany", "name")
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email")
      .populate("comments.by", "fullName");

    if (!task)
      return res.status(404).json({ success: false, message: "Task not found" });

    res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};




// Controller function
export const updateTaskProgress = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { progress, status } = req.body;
    const userId = req.user._id;

    // Find task assignment for this user
    const assignment = await TaskAssignment.findOne({
      task: taskId,
      user: userId,
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Task assignment not found",
      });
    }

    // Update progress and status if provided
    if (progress !== undefined) assignment.progress = progress;
    if (status) assignment.status = status;

    assignment.logs.push({
      action: "Progress updated",
      by: userId,
      at: new Date(),
      extra: { progress, status },
    });

    await assignment.save();

    // Also update the main task status if this user is the only assignee
    const task = await Task.findById(taskId);
    if (task && task.assignedTo.length === 1 && task.assignedTo[0].toString() === userId.toString()) {
      if (status) {
        task.status = status;
        await task.save();
      }
    }
    res.status(200).json({
      success: true,
      message: "Progress updated successfully",
      data: assignment,
    });
  } catch (err) {
    console.error("Error updating progress:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE TASK STATUS (TEAM MEMBER)
export const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // find assignment of this user for this task
    const assignment = await TaskAssignment.findOne({
      task: taskId,
      user: userId,
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Task assignment not found for this user",
      });
    }

    assignment.status = status;

    assignment.logs.push({
      action: "Status updated",
      by: userId,
      at: new Date(),
      extra: { status },
    });

    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "Status updated successfully",
      data: assignment,
    });

  } catch (err) {
    console.log("Error updating status:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🆕 ALTERNATIVE: More robust version of getMyTasks
// TEMPORARY FIX for getMyTasks
export const getMyTasks = async (req, res) => {
  try {
    console.log('=== getMyTasks called ===');
    console.log('req.user:', req.user);
    
    // If req.user is undefined, try to get user from token directly
    let userId;
    
    if (req.user && req.user._id) {
      userId = req.user._id;
      console.log('✅ Using req.user._id:', userId);
    } else {
      // Fallback: Try to extract user ID from token
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          userId = decoded.id;
          console.log('🔄 Using user ID from token:', userId);
        } catch (tokenError) {
          console.error('❌ Token decode error:', tokenError.message);
          return res.status(401).json({
            success: false,
            message: 'Invalid token'
          });
        }
      }
    }
    
    if (!userId) {
      console.log('❌ No user ID found');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { status, priority, search, limit } = req.query;

    console.log(`🔍 Fetching tasks for user: ${userId}`);

    // Get all task assignments for the user
    const assignmentFilter = { user: userId };
    if (status) assignmentFilter.status = status;

    const assignments = await TaskAssignment.find(assignmentFilter)
      .sort({ createdAt: -1 });

    console.log(`📋 Found ${assignments.length} assignments`);

    if (assignments.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // Extract task IDs from assignments
    const taskIds = assignments.map(assignment => assignment.task);
    
    // Get all tasks that are assigned to this user
    const tasks = await Task.find({ _id: { $in: taskIds } })
      .populate("client", "name email phone businessName meta chosenServices")
      .populate("subCompany", "name")
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    console.log(`📝 Found ${tasks.length} tasks`);

    // Create a map of assignment data by task ID for quick lookup
    const assignmentMap = {};
    assignments.forEach(assignment => {
      assignmentMap[assignment.task.toString()] = assignment;
    });

    // Combine task data with assignment data
    const tasksWithAssignment = tasks.map(task => {
      const assignment = assignmentMap[task._id.toString()];
      const taskObj = task.toObject();
      
      return {
        ...taskObj,
        assignment: assignment ? {
          _id: assignment._id,
          status: assignment.status,
          progress: assignment.progress,
          notes: assignment.notes,
          logs: assignment.logs
        } : null,
        progress: assignment?.progress || 0,
        userStatus: assignment?.status || 'not_started'
      };
    });

    // Apply additional filters
    let filteredTasks = tasksWithAssignment;

    if (priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === priority);
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filteredTasks = filteredTasks.filter(task => 
        searchRegex.test(task.title)
      );
    }

    // Apply limit
    if (limit) {
      filteredTasks = filteredTasks.slice(0, Number(limit));
    }

    console.log(`🎯 Final tasks to return: ${filteredTasks.length}`);

    res.status(200).json({
      success: true,
      count: filteredTasks.length,
      data: filteredTasks,
    });
  } catch (err) {
    console.error("❌ Error fetching my tasks:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};