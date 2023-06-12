const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized Access' })
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'Unauthorized Access' })
    }
    req.decoded = decoded;
    next();
  })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.a81ulqy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();

    const userCollection = client.db("campCraftopiaDB").collection("users");
    const classesCollection = client.db("campCraftopiaDB").collection("classes");
    const instructorsCollection = client.db("campCraftopiaDB").collection("instructors");
    const bookingCollection = client.db("campCraftopiaDB").collection("bookings");
    const paymentCollection = client.db("campCraftopiaDB").collection("payments");


    // Token Related APIs
    app.post('/jwt', (req, res) => {
      const user = req.body;
      try {
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        res.send({ token });
      } catch (error) {
        console.error('Failed to generate access token:', error);
        res.status(500).send({ error: true, message: 'Failed to generate access token' });
      }
    });

    const verifyAdmin = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email}
      const user = await userCollection.findOne(query);
      if(user?.role === 'admin'){
        next();
      }
      else{
        return res.status(403).send({error: true, message: 'forbidden message'})
      }
    }

    const verifyInstructor = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email}
      const user = await userCollection.findOne(query);
      if(user?.role === 'instructor'){
        next();
      }
      else{
        return res.status(403).send({error: true, message: 'forbidden message'})
      }
    }

    const verifyStudent = async(req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email}
      const user = await userCollection.findOne(query);
      if(user?.role === 'student'){
        next();
      }
      else{
        return res.status(403).send({error: true, message: 'forbidden message'})
      }
    }

    // Users Related APIs
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User Already Exists' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';

      res.send({ admin: isAdmin });
    });

    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isInstructor = user?.role === 'instructor';

      res.send({ instructor: isInstructor });
    });

    app.get('/users/student/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isStudent = user?.role === 'student';

      res.send({ student: isStudent });
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          role: 'admin'
        },
      };

      const result = await userCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          role: 'instructor'
        },
      };
    
      const result = await userCollection.updateOne(filter, updateRole);
    
      if (result.modifiedCount === 1) {
        const instructor = await userCollection.findOne(filter);
        const approvedClasses = await classesCollection.find({ instructor: instructor.name, status: 'Approved' }).toArray();
    
        if (approvedClasses.length > 0) {
          const instructorData = {
            userId: id,
            name: instructor.name,
            email: instructor.email,
            image: instructor.photo,
          };
          const insertResult = await instructorsCollection.insertOne(instructorData);
          res.json({ modifiedCount: result.modifiedCount, insertResult });
        } else {
          res.json({ modifiedCount: result.modifiedCount, message: 'No approved classes found for this instructor.' });
        }
      } else {
        res.json({ modifiedCount: result.modifiedCount, message: 'Failed to update user role.' });
      }
    });
    

    app.patch('/users/student/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = {
        $set: {
          role: 'student'
        },
      };

      const result = await userCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // Classes Related APIs
    
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

      
    app.post('/classes', verifyJWT, async (req, res) => {
      const newClassData = req.body;
      const result = await classesCollection.insertOne(newClassData);
      res.send(result);
    });

    app.patch('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { feedback, status } = req.body;
    
      const updateFields = {};
    
      if (feedback) {
        updateFields.feedback = feedback;
      }
    
      if (status) {
        updateFields.status = status;
      }
    
      const updateQuery = {
        $set: updateFields,
      };
    
      const result = await classesCollection.updateOne(filter, updateQuery);
      res.send(result);
    });

    app.get('/my-classes', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
        return;
      }
    
      const query = { email: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

  
    app.put('/my-classes/:id', verifyJWT, async (req, res) => {
      const classId = req.params.id;
      const objectId = new ObjectId(classId);
      const updatedData = req.body;
      
      delete updatedData._id;
      {
        const result = await classesCollection.findOneAndUpdate(
          { _id: objectId },
          { $set: updatedData },
          { returnOriginal: false }
        );
    
        if (!result.value) {
          return res.status(404).json({ error: "Class not found" });
        }
    
        res.json(result.value);
      }
    });
    

    // Instructors Related APIs
    app.get('/instructors', async (req, res) => {
      const result = await instructorsCollection.find().toArray();
      res.send(result);
    });

    // Bookings Related APIs
    app.get('/bookings', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden Access' })
      }

      const query = { email: email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/bookings', async (req, res) => {
      const classData = req.body;
      const result = await bookingCollection.insertOne(classData);
      res.send(result);
    });

    app.delete('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    // Payment Related APIs
 
    app.get('/payments', verifyJWT, verifyStudent, async(req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden Access' })
      }

      const query = { email: email };

      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })




    app.post('/create-payment-intent', verifyJWT, verifyStudent, async(req, res) => {
      const {price} = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    app.post('/payments', verifyJWT, verifyStudent, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const classId = payment.classId;
      const query = { _id: new ObjectId(classId) };
      const deleteResult = await bookingCollection.deleteOne(query);
    
      const updateClassSeatId = payment.bookingId;
      const updateClassData = await classesCollection.findOne({ _id: new ObjectId(updateClassSeatId) });
      
      if (updateClassData.availableSeats <= 0) {
        return res.status(400).json({ error: true, message: 'No available seats' });
      }
    
      await classesCollection.updateOne(
        { _id: new ObjectId(updateClassSeatId) },
        { $inc: { availableSeats: -1, totalStudents: 1 } }
      );
    
      res.send({ insertResult, deleteResult, updatedSeats: updateClassData.availableSeats });
    });
    
    
    // Admin Dashboard API

    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const classes = await classesCollection.estimatedDocumentCount();
      const purchases = await paymentCollection.estimatedDocumentCount();

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce( (sum, entry) => sum + entry.price, 0)
      res.send({
        users,
        classes,
        purchases,
        revenue
      })
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Camp Craftopia is Running')
})

app.listen(port, () => {
  console.log(`Camp Craftopia is Running On Port: ${port}`)
})